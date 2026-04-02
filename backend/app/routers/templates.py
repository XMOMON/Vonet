from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.all import SignalTemplate, DirectionEnum, ConfidenceEnum

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    pair: str
    direction: DirectionEnum
    tp1_pct: Optional[float] = None
    tp2_pct: Optional[float] = None
    sl_pct: Optional[float] = None
    confidence: Optional[ConfidenceEnum] = ConfidenceEnum.BUY
    reason: Optional[str] = ""
    notes: Optional[str] = ""


class TemplateResponse(BaseModel):
    id: int
    name: str
    pair: str
    direction: DirectionEnum
    tp1_pct: Optional[float] = None
    tp2_pct: Optional[float] = None
    sl_pct: Optional[float] = None
    confidence: Optional[ConfidenceEnum] = None
    reason: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SignalTemplate).order_by(SignalTemplate.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(template: TemplateCreate, db: AsyncSession = Depends(get_db)):
    db_template = SignalTemplate(**template.model_dump())
    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)
    return db_template


@router.delete("/{template_id}")
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SignalTemplate).where(SignalTemplate.id == template_id)
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tpl)
    await db.commit()
    return {"status": "deleted", "id": template_id}
