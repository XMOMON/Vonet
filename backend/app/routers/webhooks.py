import hmac
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from typing import Optional

from app.config import settings
from app.database import get_db
from app.models.all import Signal, Position, DirectionEnum, ConfidenceEnum, SignalStatus, PositionStatus
from app.services.telegram import send_telegram

logger = logging.getLogger(__name__)

router = APIRouter()


class TradingViewPayload(BaseModel):
    secret: str
    pair: str = Field(..., example="BTC/USDT")
    direction: str = Field(..., example="LONG")
    entry: float
    tp1: float
    tp2: float
    sl: float
    reason: str = ""
    confidence: str = "BUY"


def _verify_secret(secret: str) -> None:
    if not hmac.compare_digest(secret.encode(), settings.WEBHOOK_SECRET.encode()):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")


def _validate_levels(payload: TradingViewPayload) -> None:
    p = payload
    if p.direction == "LONG":
        if not (p.sl < p.entry < p.tp1):
            raise HTTPException(status_code=422, detail="LONG requires: SL < entry < TP1")
        if p.tp2 and p.tp2 <= p.tp1:
            raise HTTPException(status_code=422, detail="LONG requires: TP2 > TP1")
    elif p.direction == "SHORT":
        if not (p.tp1 < p.entry < p.sl):
            raise HTTPException(status_code=422, detail="SHORT requires: TP1 < entry < SL")
        if p.tp2 and p.tp2 >= p.tp1:
            raise HTTPException(status_code=422, detail="SHORT requires: TP2 < TP1")
    else:
        raise HTTPException(status_code=422, detail=f"direction must be LONG or SHORT, got: {p.direction}")


async def _check_duplicate(pair: str, direction: str, db: AsyncSession) -> None:
    result = await db.execute(
        select(Signal).where(
            Signal.pair == pair,
            Signal.direction == DirectionEnum[direction],
            Signal.status == SignalStatus.PENDING,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A PENDING {direction} signal for {pair} already exists (id={existing.id})"
        )


async def _check_max_positions(db: AsyncSession) -> None:
    result = await db.execute(
        select(func.count()).select_from(Position).where(
            Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])
        )
    )
    count = result.scalar()
    if count >= settings.MAX_POSITIONS:
        raise HTTPException(
            status_code=409,
            detail=f"Max open positions ({settings.MAX_POSITIONS}) reached"
        )


@router.post("/tradingview", status_code=201)
async def tradingview_webhook(
    payload: TradingViewPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive a TradingView alert and create a new signal.
    
    Send from TradingView alerts with JSON body:
    {
      "secret": "your_webhook_secret",
      "pair": "BTC/USDT",
      "direction": "LONG",
      "entry": 65000,
      "tp1": 67000,
      "tp2": 70000,
      "sl": 63000,
      "reason": "Breakout long",
      "confidence": "BUY"
    }
    """
    _verify_secret(payload.secret)

    payload.pair = payload.pair.upper().replace("-", "/")
    payload.direction = payload.direction.upper()

    # Validate confidence
    try:
        confidence_enum = ConfidenceEnum[payload.confidence.upper()]
    except KeyError:
        confidence_enum = ConfidenceEnum.BUY

    _validate_levels(payload)
    await _check_duplicate(payload.pair, payload.direction, db)
    await _check_max_positions(db)

    signal = Signal(
        pair=payload.pair,
        direction=DirectionEnum[payload.direction],
        entry=payload.entry,
        tp1=payload.tp1,
        tp2=payload.tp2,
        sl=payload.sl,
        reason=payload.reason or "TradingView alert",
        confidence=confidence_enum,
        source="tradingview",
        status=SignalStatus.PENDING,
        created_at=datetime.utcnow(),
    )
    db.add(signal)
    await db.commit()
    await db.refresh(signal)

    logger.info(f"[Webhook] Signal created: {signal.id} | {signal.pair} {signal.direction.value}")

    arrow = "🟢" if payload.direction == "LONG" else "🔴"
    rr_num = 0.0
    if payload.direction == "LONG" and (payload.entry - payload.sl) != 0:
        rr_num = round((payload.tp2 - payload.entry) / (payload.entry - payload.sl), 2)
    elif payload.direction == "SHORT" and (payload.sl - payload.entry) != 0:
        rr_num = round((payload.entry - payload.tp2) / (payload.sl - payload.entry), 2)

    await send_telegram(
        f"{arrow} <b>📡 TradingView Signal</b>\n\n"
        f"Pair: <b>{signal.pair}</b>\n"
        f"Direction: <b>{signal.direction.value}</b>\n"
        f"Entry: <b>${signal.entry:,.4f}</b>\n"
        f"TP1: <b>${signal.tp1:,.4f}</b>  TP2: <b>${signal.tp2:,.4f}</b>\n"
        f"SL: <b>${signal.sl:,.4f}</b>\n"
        f"R:R: <b>{rr_num}R</b>\n"
        f"Reason: {signal.reason}\n\n"
        f"⏳ Waiting for entry trigger..."
    )

    return {
        "status": "created",
        "signal_id": signal.id,
        "pair": signal.pair,
        "direction": signal.direction.value,
    }
