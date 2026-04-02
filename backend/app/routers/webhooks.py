import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_db
from app.models.all import Signal, DirectionEnum, SignalStatus
from app.services.telegram import send_signal_created_alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


# ── Payload schema ────────────────────────────────────────────────────────────

class TradingViewPayload(BaseModel):
    secret: str
    pair: str = Field(..., example="BTC/USDT")
    direction: str = Field(..., example="LONG")
    entry: float
    tp1: float
    tp2: float
    sl: float
    reason: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_secret(secret: str) -> None:
    """Constant-time comparison to prevent timing attacks."""
    if not hmac.compare_digest(secret.encode(), settings.WEBHOOK_SECRET.encode()):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")


def _validate_levels(payload: TradingViewPayload) -> None:
    """Ensure TP/SL levels make logical sense for the direction."""
    p = payload
    if p.direction == "LONG":
        if not (p.sl < p.entry < p.tp1):
            raise HTTPException(
                status_code=422,
                detail="LONG requires: SL < entry < TP1"
            )
        if p.tp2 and p.tp2 <= p.tp1:
            raise HTTPException(
                status_code=422,
                detail="LONG requires: TP2 > TP1"
            )
    elif p.direction == "SHORT":
        if not (p.tp1 < p.entry < p.sl):
            raise HTTPException(
                status_code=422,
                detail="SHORT requires: TP1 < entry < SL"
            )
        if p.tp2 and p.tp2 >= p.tp1:
            raise HTTPException(
                status_code=422,
                detail="SHORT requires: TP2 < TP1"
            )
    else:
        raise HTTPException(
            status_code=422,
            detail=f"direction must be LONG or SHORT, got: {p.direction}"
        )


async def _check_duplicate(pair: str, direction: str, db: AsyncSession) -> None:
    """Reject if a PENDING signal for the same pair+direction already exists."""
    result = await db.execute(
        select(Signal).where(
            Signal.pair == pair,
            Signal.direction == direction,
            Signal.status == SignalStatus.PENDING,
        )
    )
    existing = result.scalars().first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A PENDING {direction} signal for {pair} already exists (id={existing.id})"
        )


async def _check_max_positions(db: AsyncSession) -> None:
    """Reject if open position count is at the configured maximum."""
    from app.models.all import Position, PositionStatus
    result = await db.execute(
        select(func.count()).where(Position.status == PositionStatus.OPEN)
    )
    count = result.scalar()
    if count >= settings.MAX_POSITIONS:
        raise HTTPException(
            status_code=409,
            detail=f"Max open positions ({settings.MAX_POSITIONS}) reached"
        )


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/tradingview", status_code=201)
async def tradingview_webhook(
    payload: TradingViewPayload,
    db: AsyncSession = Depends(get_db),
):
    # 1. Auth
    _verify_secret(payload.secret)

    # 2. Normalize
    payload.pair = payload.pair.upper().replace("-", "/")
    payload.direction = payload.direction.upper()

    # 3. Validate price levels
    _validate_levels(payload)

    # 4. Business rule checks
    await _check_duplicate(payload.pair, payload.direction, db)
    await _check_max_positions(db)

    # 5. Create signal
    signal = Signal(
        pair=payload.pair,
        direction=DirectionEnum[payload.direction],
        entry=payload.entry,
        tp1=payload.tp1,
        tp2=payload.tp2,
        sl=payload.sl,
        reason=payload.reason or "TradingView alert",
        source="tradingview",
        status=SignalStatus.PENDING,
        created_at=datetime.utcnow(),
    )
    db.add(signal)
    await db.commit()
    await db.refresh(signal)

    logger.info(f"[Webhook] Signal created: {signal.id} | {signal.pair} {signal.direction}")

    # 6. Telegram notification
    await send_signal_created_alert(
        pair=signal.pair,
        direction=signal.direction.value,
        entry=signal.entry,
        tp1=signal.tp1,
        tp2=signal.tp2,
        sl=signal.sl,
        confidence="BUY",
    )

    return {
        "status": "created",
        "signal_id": signal.id,
        "pair": signal.pair,
        "direction": signal.direction.value,
    }