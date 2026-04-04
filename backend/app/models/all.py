import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey, Text
from app.database import Base
from sqlalchemy.orm import relationship

class DirectionEnum(enum.Enum):
    LONG = "LONG"
    SHORT = "SHORT"

class SignalStatus(enum.Enum):
    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"

class PositionStatus(enum.Enum):
    OPEN = "OPEN"
    PARTIAL = "PARTIAL"
    CLOSED = "CLOSED"

class ConfidenceEnum(enum.Enum):
    STRONG_BUY = "STRONG_BUY"
    BUY = "BUY"
    NEUTRAL = "NEUTRAL"
    SELL = "SELL"
    STRONG_SELL = "STRONG_SELL"

class Signal(Base):
    __tablename__ = "signals"
    id = Column(Integer, primary_key=True, index=True)
    pair = Column(String, index=True)
    direction = Column(Enum(DirectionEnum))
    entry = Column(Float)
    tp1 = Column(Float)
    tp2 = Column(Float)
    sl = Column(Float)
    reason = Column(String)
    confidence = Column(Enum(ConfidenceEnum))
    source = Column(String)
    notes = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    status = Column(Enum(SignalStatus), default=SignalStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    leverage = Column(Integer, default=30)  # futures leverage multiplier

    positions = relationship("Position", back_populates="signal")

class Position(Base):
    __tablename__ = "positions"
    id = Column(Integer, primary_key=True, index=True)
    signal_id = Column(Integer, ForeignKey("signals.id"))
    pair = Column(String, index=True)
    direction = Column(Enum(DirectionEnum))
    entry = Column(Float)
    current_price = Column(Float)
    tp1 = Column(Float)
    tp2 = Column(Float)
    sl = Column(Float)
    size_usd = Column(Float)   # notional value = margin * leverage
    margin_usd = Column(Float, nullable=True)  # actual collateral locked
    leverage = Column(Integer, default=30)     # futures leverage multiplier
    pnl_usd = Column(Float, default=0.0)
    status = Column(Enum(PositionStatus), default=PositionStatus.OPEN)
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    exit_price = Column(Float, nullable=True)
    exit_reason = Column(String, nullable=True)

    signal = relationship("Signal", back_populates="positions")
    trades = relationship("Trade", back_populates="position")

class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"))
    pair = Column(String, index=True)
    entry = Column(Float)
    exit = Column(Float)
    pnl_usd = Column(Float)
    pnl_pct = Column(Float)
    exit_reason = Column(String)
    journal = Column(Text, nullable=True)
    opened_at = Column(DateTime)
    closed_at = Column(DateTime, default=datetime.utcnow)

    position = relationship("Position", back_populates="trades")

class BalanceHistory(Base):
    __tablename__ = "balance_history"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    balance_usd = Column(Float)
    unrealized_pnl = Column(Float)

class SignalTemplate(Base):
    __tablename__ = "signal_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    pair = Column(String, nullable=False)
    direction = Column(Enum(DirectionEnum), nullable=False)
    tp1_pct = Column(Float, nullable=True)   # % distance from entry
    tp2_pct = Column(Float, nullable=True)
    sl_pct = Column(Float, nullable=True)
    confidence = Column(Enum(ConfidenceEnum), nullable=True)
    reason = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
