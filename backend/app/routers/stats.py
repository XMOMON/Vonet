from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.all import Trade, Position, PositionStatus, BalanceHistory
from app.utils.metrics import calculate_advanced_metrics
from datetime import datetime, timedelta

router = APIRouter(tags=["stats"])


@router.get("/balance")
async def get_balance(db: AsyncSession = Depends(get_db)):
    STARTING_BALANCE = 10000.0

    # Total realized PnL from closed trades
    total_pnl_query = select(func.sum(Trade.pnl_usd))
    res = await db.execute(total_pnl_query)
    total_pnl = res.scalar() or 0.0

    # Unrealized PnL from open positions
    unrealized_query = select(func.sum(Position.pnl_usd)).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL]))
    unrealized_res = await db.execute(unrealized_query)
    unrealized_pnl = unrealized_res.scalar() or 0.0

    balance = STARTING_BALANCE + total_pnl
    equity = balance + unrealized_pnl

    return {
        "balance": round(balance, 2),
        "equity": round(equity, 2),
        "unrealized_pnl": round(unrealized_pnl, 2)
    }


@router.get("/history")
async def get_balance_history(db: AsyncSession = Depends(get_db)):
    """Return balance history for equity curve chart."""
    result = await db.execute(select(BalanceHistory).order_by(BalanceHistory.timestamp))
    history = result.scalars().all()
    return [
        {
            "timestamp": h.timestamp.isoformat(),
            "balance": h.balance_usd,
            "equity": h.balance_usd + h.unrealized_pnl,
        }
        for h in history
    ]


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

    # Average R:R could be computed from signals; skip for now

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

    # Average PnL percentage across all trades
    avg_pnl_pct_query = select(func.avg(Trade.pnl_pct))
    avg_pnl_res = await db.execute(avg_pnl_pct_query)
    avg_pnl_pct = avg_pnl_res.scalar() or 0.0

    # Unrealized PnL from open positions
    unrealized_query = select(func.sum(Position.pnl_usd)).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL]))
    unrealized_res = await db.execute(unrealized_query)
    unrealized_pnl = unrealized_res.scalar() or 0.0

    return {
        "total_pnl": round(total_pnl, 2),
        "unrealized_pnl": round(unrealized_pnl, 2),
        "win_rate": round(win_rate, 2),
        "total_trades": total_trades,
        "avg_pnl_pct": round(avg_pnl_pct, 2),
        "advanced": advanced
    }
