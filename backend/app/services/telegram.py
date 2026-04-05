import aiohttp
import asyncio
import os
from datetime import datetime

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# ─────────────────────────────────────────────
# Core sender
# ─────────────────────────────────────────────
async def send_telegram(message: str, chat_id: str = None):
    """Send a message via Telegram Bot API. Silently fails if not configured."""
    token = TELEGRAM_BOT_TOKEN
    cid = chat_id or TELEGRAM_CHAT_ID
    if not token or not cid:
        return

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": cid,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    print(f"Telegram API error: {resp.status}")
    except Exception as e:
        print(f"Telegram send error: {e}")


# ─────────────────────────────────────────────
# Trade alerts
# ─────────────────────────────────────────────
async def send_signal_created_alert(pair: str, direction: str, entry: float, tp1: float, tp2: float, sl: float, confidence: str, expires_at=None):
    arrow = "🟢" if direction == "LONG" else "🔴"
    rr = round((tp2 - entry) / (entry - sl), 2) if direction == "LONG" and (entry - sl) != 0 else \
         round((entry - tp2) / (sl - entry), 2) if direction == "SHORT" and (sl - entry) != 0 else 0.0
    expiry_line = f"\nExpires: <b>{expires_at.strftime('%Y-%m-%d %H:%M')}</b>" if expires_at else ""
    msg = (
        f"{arrow} <b>NEW SIGNAL</b>\n\n"
        f"Pair: <b>{pair}</b>\n"
        f"Direction: <b>{direction}</b>\n"
        f"Entry: <b>${entry:,.4f}</b>\n"
        f"TP1: <b>${tp1:,.4f}</b>  TP2: <b>${tp2:,.4f}</b>\n"
        f"SL: <b>${sl:,.4f}</b>\n"
        f"R:R: <b>{rr}R</b>  |  Confidence: <b>{confidence.replace('_', ' ')}</b>"
        f"{expiry_line}\n\n"
        f"⏳ Waiting for entry trigger..."
    )
    await send_telegram(msg)


async def send_entry_alert(pair: str, direction: str, entry_price: float, size_usd: float):
    arrow = "🟢" if direction == "LONG" else "🔴"
    msg = (
        f"{arrow} <b>ENTRY TRIGGERED</b>\n\n"
        f"Pair: <b>{pair}</b>\n"
        f"Direction: <b>{direction}</b>\n"
        f"Entry: <b>${entry_price:,.4f}</b>\n"
        f"Size: <b>${size_usd:,.2f}</b>\n\n"
        f"⏳ Monitoring TP/SL..."
    )
    await send_telegram(msg)


async def send_tp1_alert(pair: str, direction: str, price: float, partial_pnl: float = 0.0):
    pnl_line = f"\n💰 Partial PnL: <b>+${partial_pnl:,.2f}</b>" if partial_pnl > 0 else ""
    msg = (
        f"🎯 <b>TP1 HIT</b>\n\n"
        f"Pair: <b>{pair}</b>\n"
        f"Direction: <b>{direction}</b>\n"
        f"Price: <b>${price:,.4f}</b>"
        f"{pnl_line}\n\n"
        f"🔒 50% closed · SL moved to breakeven"
    )
    await send_telegram(msg)


async def send_close_alert(pair: str, direction: str, entry: float, exit_price: float, pnl_usd: float, pnl_pct: float, reason: str):
    icon = "✅" if pnl_usd >= 0 else "❌"
    pnl_sign = "+" if pnl_usd >= 0 else ""
    msg = (
        f"{icon} <b>POSITION CLOSED</b>\n\n"
        f"Pair: <b>{pair}</b>\n"
        f"Direction: <b>{direction}</b>\n"
        f"Entry: ${entry:,.4f}\n"
        f"Exit: ${exit_price:,.4f}\n"
        f"Reason: <b>{reason}</b>\n\n"
        f"PnL: <b>{pnl_sign}${pnl_usd:,.2f} ({pnl_sign}{pnl_pct:.2f}%)</b>"
    )
    await send_telegram(msg)


async def send_signal_expired_alert(pair: str, direction: str):
    msg = (
        f"⌛ <b>SIGNAL EXPIRED</b>\n\n"
        f"Pair: <b>{pair}</b>  |  Direction: <b>{direction}</b>\n"
        f"Signal auto-cancelled — price never reached entry."
    )
    await send_telegram(msg)


# ─────────────────────────────────────────────
# Profit milestone alerts (+25%, +50%, +100%)
# ─────────────────────────────────────────────
async def send_profit_milestone_alert(pair: str, direction: str, price: float, pnl_usd: float, pnl_pct: float, milestone: str):
    """Send notification when floating profit hits a milestone (+25%, +50%, +100%)."""
    icons = {
        "25%": "🔹",
        "50%": "🔸",
        "100%": "💎"
    }
    icon = icons.get(milestone, "🎯")
    sign = "+" if pnl_usd >= 0 else ""
    msg = (
        f"{icon} <b>PROFIT MILESTONE REACHED</b>\n\n"
        f"Pair: <b>{pair}</b>\n"
        f"Direction: <b>{direction}</b>\n"
        f"Current Price: <b>${price:,.4f}</b>\n"
        f"Floating PnL: <b>{sign}${pnl_usd:,.2f} ({sign}{pnl_pct:.2f}%)</b>\n\n"
        f"🏆 Hit <b>{milestone}</b> of target!"
    )
    await send_telegram(msg)


# ─────────────────────────────────────────────
# Command Bot (two-way: /status, /positions, /balance)
# ─────────────────────────────────────────────
_last_update_id = 0


async def _get_updates():
    global _last_update_id
    token = TELEGRAM_BOT_TOKEN
    if not token:
        return []
    url = f"https://api.telegram.org/bot{token}/getUpdates"
    params = {"timeout": 5, "offset": _last_update_id + 1}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                data = await resp.json()
                if data.get("ok"):
                    updates = data.get("result", [])
                    if updates:
                        _last_update_id = updates[-1]["update_id"]
                    return updates
    except Exception as e:
        print(f"Telegram getUpdates error: {e}")
    return []


async def _handle_command(text: str, chat_id: str):
    """Handle incoming bot commands by fetching live data."""
    from app.database import async_session
    from app.models.all import Position, Trade, PositionStatus
    from sqlalchemy.future import select
    from sqlalchemy.sql import func

    text_raw = text.strip()
    parts = text_raw.split()
    cmd = parts[0].lower()

    if cmd in ("/status", "/start"):
        async with async_session() as db:
            r1 = await db.execute(select(func.count(Position.id)).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])))
            open_count = r1.scalar() or 0
            r2 = await db.execute(select(func.sum(Trade.pnl_usd)))
            realized = r2.scalar() or 0.0
            r3 = await db.execute(select(func.sum(Position.pnl_usd)).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])))
            unrealized = r3.scalar() or 0.0
            balance = 10000.0 + realized
            equity = balance + unrealized
        sign = "+" if realized >= 0 else ""
        msg = (
            f"📊 <b>Pro Paper Trader — Status</b>\n\n"
            f"💰 Equity: <b>${equity:,.2f}</b>\n"
            f"📈 Balance: <b>${balance:,.2f}</b>\n"
            f"Realized PnL: <b>{sign}${realized:,.2f}</b>\n"
            f"Unrealized PnL: <b>${unrealized:,.2f}</b>\n"
            f"Open Positions: <b>{open_count}</b>"
        )
        await send_telegram(msg, chat_id)

    elif cmd == "/positions":
        async with async_session() as db:
            r = await db.execute(select(Position).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])))
            positions = r.scalars().all()

        if not positions:
            await send_telegram("📭 No open positions right now.", chat_id)
            return

        lines = ["📋 <b>Open Positions</b>\n"]
        for p in positions:
            sign = "+" if p.pnl_usd >= 0 else ""
            icon = "🟢" if p.direction.value == "LONG" else "🔴"
            lines.append(
                f"{icon} <b>{p.pair}</b> {p.direction.value}\n"
                f"   Entry: ${p.entry:,.4f}  →  Now: ${p.current_price:,.4f}\n"
                f"   PnL: <b>{sign}${p.pnl_usd:,.2f}</b>  |  Size: ${p.size_usd:,.0f}\n"
            )
        await send_telegram("\n".join(lines), chat_id)

    elif cmd == "/balance":
        async with async_session() as db:
            r = await db.execute(select(func.sum(Trade.pnl_usd)))
            realized = r.scalar() or 0.0
            r2 = await db.execute(select(func.sum(Position.pnl_usd)).where(Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])))
            unrealized = r2.scalar() or 0.0
        balance = 10000.0 + realized
        equity = balance + unrealized
        sign = "+" if realized >= 0 else ""
        msg = (
            f"💰 <b>Account Balance</b>\n\n"
            f"Equity: <b>${equity:,.2f}</b>\n"
            f"Realized PnL: <b>{sign}${realized:,.2f}</b>\n"
            f"Unrealized: <b>${unrealized:,.2f}</b>"
        )
        await send_telegram(msg, chat_id)

    elif cmd == "/help":
        await send_telegram(
            "🤖 <b>Pro Paper Trader Bot</b>\n\n"
            "/status — Account overview\n"
            "/positions — All open positions\n"
            "/balance — Quick balance check\n"
            "/daily — Today's performance report\n"
            "/signal PAIR DIR ENTRY TP1 TP2 SL — Create signal\n"
            "  e.g. /signal BTC/USDT LONG 65000 67000 70000 63000\n"
            "/help — This message",
            chat_id
        )

    elif cmd == "/daily":
        await _send_daily_report(chat_id)

    elif cmd == "/signal":
        # /signal BTC/USDT LONG 65000 67000 70000 63000 [reason...]
        # parts: [0]=cmd [1]=pair [2]=dir [3]=entry [4]=tp1 [5]=tp2 [6]=sl [7+]=reason
        if len(parts) < 7:
            await send_telegram(
                "❌ Usage: /signal PAIR DIRECTION ENTRY TP1 TP2 SL [reason]\n"
                "Example: /signal BTC/USDT LONG 65000 67000 70000 63000",
                chat_id
            )
            return
        try:
            pair = parts[1].upper().replace("-", "/")
            direction = parts[2].upper()
            entry = float(parts[3])
            tp1 = float(parts[4])
            tp2 = float(parts[5])
            sl = float(parts[6])
            reason = " ".join(parts[7:]) if len(parts) > 7 else "Telegram signal"
        except ValueError:
            await send_telegram("❌ Invalid numbers. Check entry/TP/SL values.", chat_id)
            return

        if direction not in ("LONG", "SHORT"):
            await send_telegram("❌ Direction must be LONG or SHORT.", chat_id)
            return

        from app.models.all import Signal, SignalStatus, DirectionEnum, ConfidenceEnum
        from datetime import datetime
        try:
            async with async_session() as db:
                signal = Signal(
                    pair=pair,
                    direction=DirectionEnum[direction],
                    entry=entry, tp1=tp1, tp2=tp2, sl=sl,
                    reason=reason,
                    confidence=ConfidenceEnum.BUY,
                    source="telegram",
                    status=SignalStatus.PENDING,
                    created_at=datetime.utcnow(),
                )
                db.add(signal)
                await db.commit()
                await db.refresh(signal)

            arrow = "🟢" if direction == "LONG" else "🔴"
            rr = 0.0
            if direction == "LONG" and (entry - sl) != 0:
                rr = round((tp2 - entry) / (entry - sl), 2)
            elif direction == "SHORT" and (sl - entry) != 0:
                rr = round((entry - tp2) / (sl - entry), 2)

            await send_telegram(
                f"{arrow} <b>Signal Created via Telegram</b>\n\n"
                f"Pair: <b>{pair}</b>  Direction: <b>{direction}</b>\n"
                f"Entry: <b>${entry:,.4f}</b>\n"
                f"TP1: <b>${tp1:,.4f}</b>  TP2: <b>${tp2:,.4f}</b>\n"
                f"SL: <b>${sl:,.4f}</b>  R:R: <b>{rr}R</b>\n"
                f"Reason: {reason}\n\n"
                f"Signal ID: #{signal.id} — waiting for entry trigger...",
                chat_id
            )
        except Exception as e:
            await send_telegram(f"❌ Failed to create signal: {e}", chat_id)


async def _send_daily_report(chat_id: str = None):
    """Build and send the daily performance summary."""
    from app.database import async_session
    from app.models.all import Position, Trade, Signal, PositionStatus, SignalStatus
    from sqlalchemy.future import select
    from sqlalchemy.sql import func
    from datetime import datetime, timezone, timedelta

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    async with async_session() as db:
        # Today's closed trades
        r_today = await db.execute(
            select(Trade).where(Trade.closed_at >= today_start)
        )
        today_trades = r_today.scalars().all()

        # All-time PnL
        r_all = await db.execute(select(func.sum(Trade.pnl_usd)))
        all_pnl = r_all.scalar() or 0.0

        # Open positions
        r_pos = await db.execute(
            select(func.count(Position.id)).where(
                Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])
            )
        )
        open_count = r_pos.scalar() or 0

        # Pending signals
        r_sig = await db.execute(
            select(func.count(Signal.id)).where(Signal.status == SignalStatus.PENDING)
        )
        pending_signals = r_sig.scalar() or 0

        # Unrealized
        r_unr = await db.execute(
            select(func.sum(Position.pnl_usd)).where(
                Position.status.in_([PositionStatus.OPEN, PositionStatus.PARTIAL])
            )
        )
        unrealized = r_unr.scalar() or 0.0

    today_pnl = sum(t.pnl_usd or 0 for t in today_trades)
    today_wins = sum(1 for t in today_trades if (t.pnl_usd or 0) > 0)
    today_total = len(today_trades)
    win_rate = round(today_wins / today_total * 100, 1) if today_total else 0

    balance = 10000.0 + all_pnl
    equity = balance + unrealized

    sign_d = "+" if today_pnl >= 0 else ""
    sign_t = "+" if all_pnl >= 0 else ""
    icon = "📈" if today_pnl >= 0 else "📉"
    date_str = datetime.now().strftime("%d %b %Y")

    msg = (
        f"{icon} <b>Daily Report — {date_str}</b>\n\n"
        f"{'─' * 28}\n"
        f"<b>TODAY</b>\n"
        f"Trades Closed: <b>{today_total}</b>  |  Wins: <b>{today_wins}</b>\n"
        f"Win Rate: <b>{win_rate}%</b>\n"
        f"Daily P&amp;L: <b>{sign_d}${today_pnl:,.2f}</b>\n\n"
        f"<b>ACCOUNT</b>\n"
        f"Equity: <b>${equity:,.2f}</b>\n"
        f"All-Time P&amp;L: <b>{sign_t}${all_pnl:,.2f}</b>\n"
        f"Unrealized: <b>${unrealized:,.2f}</b>\n\n"
        f"<b>LIVE</b>\n"
        f"Open Positions: <b>{open_count}</b>\n"
        f"Pending Signals: <b>{pending_signals}</b>"
    )
    await send_telegram(msg, chat_id)


async def daily_report_loop():
    """Fires the daily report at midnight UTC every day."""
    if not TELEGRAM_BOT_TOKEN:
        return
    print("Daily report loop started — will fire at midnight UTC")
    while True:
        now = __import__('datetime').datetime.utcnow()
        # Seconds until next midnight UTC
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = tomorrow.replace(day=tomorrow.day + 1)
        secs = (tomorrow - now).total_seconds()
        await asyncio.sleep(secs)
        try:
            await _send_daily_report()
        except Exception as e:
            print(f"Daily report error: {e}")


async def command_bot_loop():
    """Background polling loop for Telegram commands."""
    if not TELEGRAM_BOT_TOKEN:
        return
    print("Telegram command bot started — listening for /status /positions /balance")
    while True:
        try:
            updates = await _get_updates()
            for update in updates:
                msg = update.get("message", {})
                text = msg.get("text", "")
                chat_id = str(msg.get("chat", {}).get("id", ""))
                if text.startswith("/") and chat_id:
                    await _handle_command(text, chat_id)
        except Exception as e:
            print(f"Command bot error: {e}")
        await asyncio.sleep(2)
