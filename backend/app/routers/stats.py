from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.trade import Trade
from app.utils.metrics import calculate_advanced_metrics
from datetime import datetime, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/")
async def get_stats(db: AsyncSession = Depends(get_db)):
    # Basic stats
    total_pnl_query = select(func.sum(Trade.pnl_usd))
    res = await db.execute(total_pnl_query)
    total_pnl = res.scalar() or 0.0

    win_query = select(func.count()).where(Trade.pnl_usd > 0)
    loss_query = select(func.count()).where(Trade.pnl_usd <= 0)
    win_count = (await db.execute(win_query)).scalar() or 0
    loss_count = (await db.execute(loss_query)).scalar() or 0
    total_trades = win_count + loss_count
    win_rate = (win_count / total_trades * 100) if total_trades else 0.0

    # Average R:R (from signals that led to trades)
    avg_rr_query = select(func.avg(Trade.tp1_price / Trade.entry_price - 1)).where(Trade.direction == "LONG")
    # However, maybe easier: compute from TP and SL distances? For simplicity, we'll skip exact R:R for now.

    # Equity curve: balance history
    # For now, we'll just return a placeholder; can be enhanced later

    # Fetch all closed trades for advanced metrics
    trades_result = await db.execute(select(Trade).order_by(Trade.closed_at))
    trades = trades_result.scalars().all()
    trade_dicts = []
    for t in trades:
        trade_dicts.append({
            "pnl_pct": float(t.pnl_pct) if t.pnl_pct else 0.0,
            "pnl_usd": float(t.pnl_usd) if t.pnl_usd else 0.0,
            "opened_at": t.opened_at,
            "closed_at": t.closed_at,
        })

    advanced = calculate_advanced_metrics(trade_dicts)

    return {
        "total_pnl": round(total_pnl, 2),
        "win_rate": round(win_rate, 2),
        "total_trades": total_trades,
        "advanced": advanced
    }
