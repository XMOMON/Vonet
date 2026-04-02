from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models.all import Position, PositionStatus, Trade
from app.services.telegram import send_close_alert

router = APIRouter()

class PositionResponse(BaseModel):
    id: int
    signal_id: Optional[int] = None
    pair: str
    direction: str
    entry: float
    current_price: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    sl: Optional[float] = None
    size_usd: Optional[float] = None
    pnl_usd: Optional[float] = 0.0
    status: str
    opened_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[PositionResponse])
async def list_positions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Position).where(
            Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])
        ).order_by(Position.opened_at.desc())
    )
    positions = result.scalars().all()
    return positions


@router.post("/{position_id}/close")
async def manual_close(position_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    if position.status not in (PositionStatus.OPEN, PositionStatus.PARTIAL):
        raise HTTPException(status_code=400, detail="Position already closed")

    current = position.current_price or position.entry
    pnl_usd = position.pnl_usd or 0.0
    pnl_pct = 0.0

    if position.entry and position.entry != 0:
        if position.direction.value == "LONG":
            pnl_pct = ((current - position.entry) / position.entry) * 100
        else:
            pnl_pct = ((position.entry - current) / position.entry) * 100

    trade = Trade(
        position_id=position.id,
        pair=position.pair,
        entry=position.entry,
        exit=current,
        pnl_usd=pnl_usd,
        pnl_pct=pnl_pct,
        exit_reason="MANUAL_CLOSE",
        opened_at=position.opened_at,
        closed_at=datetime.utcnow(),
    )
    db.add(trade)
    position.status = PositionStatus.CLOSED
    await db.commit()

    await send_close_alert(
        pair=position.pair,
        direction=position.direction.value,
        entry=position.entry,
        exit_price=current,
        pnl_usd=pnl_usd,
        pnl_pct=pnl_pct,
        reason="Manual Close",
    )

    return {"status": "closed", "position_id": position_id, "pnl_usd": round(pnl_usd, 2)}