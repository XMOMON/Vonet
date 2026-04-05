import asyncio
from datetime import datetime
from app.database import async_session
from app.models.all import Position, Signal, PositionStatus, DirectionEnum, SignalStatus, Trade, BalanceHistory
from sqlalchemy.future import select
from sqlalchemy.sql import func
from app.services.price import get_current_price
from app.routers.ws import manager
from app.services.telegram import send_entry_alert, send_tp1_alert, send_close_alert, send_signal_expired_alert, send_profit_milestone_alert

STARTING_BALANCE = 10000.0


async def _get_live_balance(db) -> float:
    result = await db.execute(select(func.sum(Trade.pnl_usd)))
    realized = result.scalar() or 0.0
    return STARTING_BALANCE + realized


def _calc_liq_price(entry: float, direction: str, leverage: int) -> float:
    """Liquidation price when 100% of margin is lost (simplified, no fees)."""
    liq_offset = entry / leverage
    if direction == "LONG":
        return entry - liq_offset
    else:
        return entry + liq_offset


async def position_monitoring_loop():
    while True:
        try:
            async with async_session() as db:

                # ── 1. Execute pending signals ────────────────────────────────
                result = await db.execute(select(Signal).where(Signal.status == SignalStatus.PENDING))
                signals = result.scalars().all()

                for signal in signals:
                    # Auto-expire stale signals
                    if signal.expires_at and datetime.utcnow() > signal.expires_at:
                        signal.status = SignalStatus.CANCELLED
                        await send_signal_expired_alert(signal.pair, signal.direction.value)
                        continue

                    price = get_current_price(signal.pair)
                    if price <= 0:
                        continue

                    tolerance = 0.005  # 0.5%
                    diff_pct = abs(price - signal.entry) / signal.entry
                    if diff_pct <= tolerance:
                        # 5% dynamic margin sizing based on live balance
                        live_balance = await _get_live_balance(db)
                        leverage = signal.leverage or 30
                        margin = live_balance * 0.05          # collateral posted
                        notional = margin * leverage           # contract size

                        new_pos = Position(
                            signal_id=signal.id,
                            pair=signal.pair,
                            direction=signal.direction,
                            entry=signal.entry,
                            current_price=price,
                            tp1=signal.tp1,
                            tp2=signal.tp2,
                            sl=signal.sl,
                            size_usd=notional,     # notional exposure
                            margin_usd=margin,     # locked collateral
                            leverage=leverage,
                            status=PositionStatus.OPEN,
                            opened_at=datetime.utcnow()
                        )
                        signal.status = SignalStatus.EXECUTED
                        db.add(new_pos)
                        await db.commit()
                        await manager.broadcast({"type": "position_opened", "data": f"Futures {signal.direction.value} x{leverage} on {signal.pair} at ${price:.4f} | Margin: ${margin:.2f}"})
                        await send_entry_alert(signal.pair, signal.direction.value, price, notional)

                # ── 2. Monitor open positions ─────────────────────────────────
                result = await db.execute(select(Position).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])))
                positions = result.scalars().all()

                for pos in positions:
                    price = get_current_price(pos.pair)
                    if price <= 0:
                        continue

                    pos.current_price = price
                    leverage = pos.leverage or 30
                    margin = pos.margin_usd or (pos.size_usd / leverage if pos.size_usd else 0)

                    # ── Leveraged PnL ────────────────────────────────────────
                    # pnl_pct here is the raw % move of the underlying
                    if pos.direction == DirectionEnum.LONG:
                        raw_pct = (price - pos.entry) / pos.entry * 100
                    else:
                        raw_pct = (pos.entry - price) / pos.entry * 100

                    leveraged_pct = raw_pct * leverage
                    pos.pnl_usd = margin * (leveraged_pct / 100)

                    # ── Profit Milestone Notifications (+10% test, +25%, +50%, +100%) ─────
                    # Track which milestones have been sent to avoid spam
                    sent = set()
                    if pos.profit_milestones_sent:
                        sent = set(pos.profit_milestones_sent.split(','))
                    for milestone_pct in [10, 25, 50, 100]:  # 10% for testing
                        if leveraged_pct >= milestone_pct and f"{milestone_pct}%" not in sent:
                            await send_profit_milestone_alert(
                                pos.pair,
                                pos.direction.value,
                                price,
                                pos.pnl_usd,
                                leveraged_pct,
                                f"{milestone_pct}%"
                            )
                            sent.add(f"{milestone_pct}%")
                            pos.profit_milestones_sent = ','.join(sorted(sent))
                    # ────────────────────────────────────────────────────────────

                    # ── Liquidation check ────────────────────────────────────
                    liq_price = _calc_liq_price(pos.entry, pos.direction.value, leverage)
                    liquidated = False
                    if pos.direction == DirectionEnum.LONG and price <= liq_price:
                        liquidated = True
                    elif pos.direction == DirectionEnum.SHORT and price >= liq_price:
                        liquidated = True

                    if liquidated:
                        pos.status = PositionStatus.CLOSED
                        pos.exit_price = price
                        pos.exit_reason = "LIQUIDATED"
                        pos.closed_at = datetime.utcnow()
                        pos.pnl_usd = -margin  # lose all margin

                        liq_trade = Trade(
                            position_id=pos.id,
                            pair=pos.pair,
                            entry=pos.entry,
                            exit=price,
                            pnl_usd=-margin,
                            pnl_pct=-100.0,
                            exit_reason="LIQUIDATED",
                            opened_at=pos.opened_at,
                            closed_at=pos.closed_at
                        )
                        db.add(liq_trade)
                        await manager.broadcast({"type": "position_liquidated", "data": f"LIQUIDATED {pos.pair} {pos.direction.value} x{leverage} at ${price:.4f} | Loss: -${margin:.2f}"})
                        await send_close_alert(pos.pair, pos.direction.value, pos.entry, price, -margin, -100.0, "LIQUIDATED")
                        continue

                    should_close = False
                    exit_reason = ""

                    if pos.direction == DirectionEnum.LONG:
                        if price >= pos.tp2:
                            should_close = True
                            exit_reason = "TP2"
                        elif price >= pos.tp1 and pos.status == PositionStatus.OPEN:
                            # ── Partial close at TP1 (50% of margin) ──
                            half_margin = margin * 0.5
                            half_pnl_usd = half_margin * (leveraged_pct / 100)

                            partial_trade = Trade(
                                position_id=pos.id,
                                pair=pos.pair,
                                entry=pos.entry,
                                exit=price,
                                pnl_usd=half_pnl_usd,
                                pnl_pct=leveraged_pct,
                                exit_reason="TP1_PARTIAL",
                                opened_at=pos.opened_at,
                                closed_at=datetime.utcnow()
                            )
                            db.add(partial_trade)

                            # Reduce position to half
                            pos.margin_usd = half_margin
                            pos.size_usd = pos.size_usd * 0.5
                            pos.pnl_usd = half_margin * (leveraged_pct / 100)
                            pos.status = PositionStatus.PARTIAL
                            pos.sl = pos.entry   # move SL to breakeven

                            await send_tp1_alert(pos.pair, pos.direction.value, price, half_pnl_usd)
                            await manager.broadcast({"type": "tp1_hit", "data": f"TP1 hit on {pos.pair} — 50% closed at ${price:.4f} | PnL: +${half_pnl_usd:.2f}"})

                        elif price <= pos.sl:
                            should_close = True
                            exit_reason = "SL"

                    else:  # SHORT
                        if price <= pos.tp2:
                            should_close = True
                            exit_reason = "TP2"
                        elif price <= pos.tp1 and pos.status == PositionStatus.OPEN:
                            half_margin = margin * 0.5
                            half_pnl_usd = half_margin * (leveraged_pct / 100)

                            partial_trade = Trade(
                                position_id=pos.id,
                                pair=pos.pair,
                                entry=pos.entry,
                                exit=price,
                                pnl_usd=half_pnl_usd,
                                pnl_pct=leveraged_pct,
                                exit_reason="TP1_PARTIAL",
                                opened_at=pos.opened_at,
                                closed_at=datetime.utcnow()
                            )
                            db.add(partial_trade)

                            pos.margin_usd = half_margin
                            pos.size_usd = pos.size_usd * 0.5
                            pos.pnl_usd = half_margin * (leveraged_pct / 100)
                            pos.status = PositionStatus.PARTIAL
                            pos.sl = pos.entry   # breakeven SL

                            await send_tp1_alert(pos.pair, pos.direction.value, price, half_pnl_usd)
                            await manager.broadcast({"type": "tp1_hit", "data": f"TP1 hit on {pos.pair} — 50% closed at ${price:.4f} | PnL: +${half_pnl_usd:.2f}"})

                        elif price >= pos.sl:
                            should_close = True
                            exit_reason = "SL"

                    # ── Full close ────────────────────────────────────────────
                    if should_close:
                        pos.status = PositionStatus.CLOSED
                        pos.exit_price = price
                        pos.exit_reason = exit_reason
                        pos.closed_at = datetime.utcnow()

                        new_trade = Trade(
                            position_id=pos.id,
                            pair=pos.pair,
                            entry=pos.entry,
                            exit=price,
                            pnl_usd=pos.pnl_usd,
                            pnl_pct=leveraged_pct,
                            exit_reason=exit_reason,
                            opened_at=pos.opened_at,
                            closed_at=pos.closed_at
                        )
                        db.add(new_trade)
                        await manager.broadcast({"type": "position_closed", "data": f"Closed {pos.pair} x{leverage} ({exit_reason}) PnL: ${pos.pnl_usd:.2f}"})
                        await send_close_alert(pos.pair, pos.direction.value, pos.entry, price, pos.pnl_usd, leveraged_pct, exit_reason)

                # ── 3. Snapshot balance history every cycle ───────────────────
                live_balance = await _get_live_balance(db)
                result_unrealized = await db.execute(
                    select(func.sum(Position.pnl_usd)).where(
                        Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])
                    )
                )
                unrealized = result_unrealized.scalar() or 0.0

                snapshot = BalanceHistory(
                    balance_usd=live_balance,
                    unrealized_pnl=unrealized
                )
                db.add(snapshot)
                await db.commit()

        except Exception as e:
            print(f"Position monitor error: {e}")

        await asyncio.sleep(5)   # snapshot every 5 seconds
