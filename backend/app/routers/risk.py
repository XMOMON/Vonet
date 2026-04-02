from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import func
from app.database import get_db
from app.models.all import Position, Trade, PositionStatus, DirectionEnum
from app.config import settings

router = APIRouter()

STARTING_BALANCE = 10000.0


@router.get("/")
async def get_risk_dashboard(db: AsyncSession = Depends(get_db)):
    """
    Returns a comprehensive risk dashboard:
    - Exposure per pair
    - Long vs Short breakdown
    - Daily realized PnL warning
    - Position count vs max
    """
    # Get realized PnL
    r = await db.execute(select(func.sum(Trade.pnl_usd)))
    realized_pnl = r.scalar() or 0.0
    balance = STARTING_BALANCE + realized_pnl

    # Open positions
    result = await db.execute(
        select(Position).where(
            Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])
        )
    )
    positions = result.scalars().all()

    # Exposure per pair
    pair_exposure: dict = {}
    total_exposure = 0.0
    long_exposure = 0.0
    short_exposure = 0.0
    total_unrealized = 0.0

    for p in positions:
        pair = p.pair
        if pair not in pair_exposure:
            pair_exposure[pair] = {"pair": pair, "size_usd": 0.0, "unrealized_pnl": 0.0, "count": 0, "directions": []}
        pair_exposure[pair]["size_usd"] += p.size_usd or 0.0
        pair_exposure[pair]["unrealized_pnl"] += p.pnl_usd or 0.0
        pair_exposure[pair]["count"] += 1
        pair_exposure[pair]["directions"].append(p.direction.value)

        total_exposure += p.size_usd or 0.0
        total_unrealized += p.pnl_usd or 0.0

        if p.direction == DirectionEnum.LONG:
            long_exposure += p.size_usd or 0.0
        else:
            short_exposure += p.size_usd or 0.0

    # Daily PnL — trades closed today
    from datetime import datetime, timezone, timedelta
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    r_daily = await db.execute(
        select(func.sum(Trade.pnl_usd)).where(Trade.closed_at >= today_start)
    )
    daily_pnl = r_daily.scalar() or 0.0

    # Daily loss limit warning (default: 5% of balance)
    daily_loss_limit_pct = 5.0
    daily_loss_limit_usd = balance * (daily_loss_limit_pct / 100)
    daily_loss_hit = daily_pnl <= -daily_loss_limit_usd

    # Max drawdown from peak
    equity = balance + total_unrealized
    dd_from_start = ((STARTING_BALANCE - equity) / STARTING_BALANCE * 100) if equity < STARTING_BALANCE else 0.0

    pairs_list = []
    for d in pair_exposure.values():
        pct_of_balance = (d["size_usd"] / balance * 100) if balance > 0 else 0.0
        d["pct_of_balance"] = round(pct_of_balance, 2)
        d["size_usd"] = round(d["size_usd"], 2)
        d["unrealized_pnl"] = round(d["unrealized_pnl"], 2)
        pairs_list.append(d)

    return {
        "balance": round(balance, 2),
        "equity": round(equity, 2),
        "open_positions": len(positions),
        "max_positions": settings.MAX_POSITIONS,
        "positions_pct_full": round(len(positions) / settings.MAX_POSITIONS * 100, 1),
        "total_exposure_usd": round(total_exposure, 2),
        "total_exposure_pct": round(total_exposure / balance * 100, 1) if balance > 0 else 0.0,
        "long_exposure_usd": round(long_exposure, 2),
        "short_exposure_usd": round(short_exposure, 2),
        "net_exposure_usd": round(long_exposure - short_exposure, 2),
        "total_unrealized_pnl": round(total_unrealized, 2),
        "daily_realized_pnl": round(daily_pnl, 2),
        "daily_loss_limit_usd": round(daily_loss_limit_usd, 2),
        "daily_loss_limit_pct": daily_loss_limit_pct,
        "daily_loss_warning": daily_loss_hit,
        "drawdown_from_start_pct": round(dd_from_start, 2),
        "pair_exposure": sorted(pairs_list, key=lambda x: x["size_usd"], reverse=True),
    }
