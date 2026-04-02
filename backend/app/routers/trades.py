from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, cast, Date
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.all import Trade

router = APIRouter()


class JournalUpdate(BaseModel):
    journal: Optional[str] = ""


@router.get("/")
async def list_trades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).order_by(Trade.closed_at.desc()))
    trades = result.scalars().all()
    return [
        {
            "id": t.id,
            "pair": t.pair,
            "entry": t.entry,
            "exit": t.exit,
            "pnl_usd": t.pnl_usd,
            "pnl_pct": t.pnl_pct,
            "exit_reason": t.exit_reason,
            "journal": t.journal or "",
            "opened_at": t.opened_at.isoformat() if t.opened_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        }
        for t in trades
    ]


@router.get("/daily-stats")
async def daily_stats(db: AsyncSession = Depends(get_db)):
    # ── Per-day aggregation ───────────────────────────────────────────────────
    result = await db.execute(
        select(
            cast(Trade.closed_at, Date).label("date"),
            func.sum(Trade.pnl_usd).label("pnl"),
            func.count(Trade.id).label("trades"),
            func.sum(
                func.cast(Trade.pnl_usd > 0, Integer := __import__('sqlalchemy').Integer)
            ).label("wins"),
        )
        .where(Trade.closed_at.isnot(None))
        .group_by(cast(Trade.closed_at, Date))
        .order_by(cast(Trade.closed_at, Date).asc())
    )
    rows = result.all()

    daily = [
        {
            "date": str(row.date),
            "pnl": round(float(row.pnl or 0), 2),
            "trades": row.trades,
            "wins": row.wins or 0,
        }
        for row in rows
    ]

    # ── Win/loss streak ───────────────────────────────────────────────────────
    trades_result = await db.execute(
        select(Trade.pnl_usd)
        .where(Trade.closed_at.isnot(None))
        .order_by(Trade.closed_at.desc())
    )
    all_pnls = [row[0] for row in trades_result.all()]

    win_streak = 0
    loss_streak = 0

    for pnl in all_pnls:
        if pnl > 0:
            if loss_streak == 0:
                win_streak += 1
            else:
                break
        elif pnl < 0:
            if win_streak == 0:
                loss_streak += 1
            else:
                break
        else:
            break

    # ── Trades today ──────────────────────────────────────────────────────────
    today = datetime.now(timezone.utc).date()
    today_result = await db.execute(
        select(func.count(Trade.id)).where(
            cast(Trade.closed_at, Date) == today
        )
    )
    trades_today = today_result.scalar() or 0

    return {
        "daily": daily,
        "win_streak": win_streak,
        "loss_streak": loss_streak,
        "trades_today": trades_today,
    }


@router.patch("/{trade_id}/journal")
async def update_journal(trade_id: int, body: JournalUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    trade.journal = body.journal
    await db.commit()
    return {"status": "ok", "id": trade_id}