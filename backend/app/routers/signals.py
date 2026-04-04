from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.all import Signal, DirectionEnum, ConfidenceEnum, SignalStatus
from app.services.telegram import send_signal_created_alert

router = APIRouter()


class SignalCreate(BaseModel):
    pair: str
    direction: DirectionEnum
    entry: float
    tp1: float
    tp2: float
    sl: float
    reason: str
    confidence: ConfidenceEnum
    source: str
    notes: str = ""
    expires_at: Optional[datetime] = None
    leverage: int = 30


class SignalResponse(BaseModel):
    id: int
    pair: str
    direction: DirectionEnum
    entry: float
    tp1: float
    tp2: float
    sl: float
    reason: str
    confidence: ConfidenceEnum
    source: str
    notes: Optional[str] = ""
    expires_at: Optional[datetime] = None
    status: SignalStatus
    created_at: Optional[datetime] = None
    leverage: int = 30

    class Config:
        from_attributes = True


@router.post("/", response_model=SignalResponse, status_code=status.HTTP_201_CREATED)
async def create_signal(signal: SignalCreate, db: AsyncSession = Depends(get_db)):
    db_signal = Signal(**signal.model_dump())
    db.add(db_signal)
    await db.commit()
    await db.refresh(db_signal)
    # Send Telegram notification for new signal
    await send_signal_created_alert(
        signal.pair,
        signal.direction.value,
        signal.entry,
        signal.tp1,
        signal.tp2,
        signal.sl,
        signal.confidence.value,
        signal.expires_at,
    )
    return db_signal


@router.get("/", response_model=List[SignalResponse])
async def list_signals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Signal).order_by(Signal.created_at.desc()))
    return result.scalars().all()


@router.delete("/{signal_id}")
async def cancel_signal(signal_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Signal).where(Signal.id == signal_id))
    db_signal = result.scalar_one_or_none()
    if not db_signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    if db_signal.status != SignalStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only PENDING signals can be cancelled")

    db_signal.status = SignalStatus.CANCELLED
    await db.commit()
    return {"status": "cancelled", "id": signal_id}
