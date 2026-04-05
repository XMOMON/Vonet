import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.all import Signal, Trade
import ccxt.async_support as ccxt
import os

# We'll use Binance as the exchange for historical data
EXCHANGE = ccxt.binance({
    'enableRateLimit': True,
    'options': {'defaultType': 'future'}  # use futures for USDT pairs
})


async def fetch_ohlcv(symbol: str, start_date: datetime, end_date: datetime, timeframe: str = '4h') -> pd.DataFrame:
    """
    Fetch OHLCV data from Binance and return as DataFrame with columns:
    timestamp (UTC), open, high, low, close, volume
    """
    since = int(start_date.timestamp() * 1000)
    until = int(end_date.timestamp() * 1000)

    all_ohlcv = []
    while since < until:
        try:
            ohlcv = await EXCHANGE.fetch_ohlcv(symbol, timeframe, since)
            if not ohlcv:
                break
            all_ohlcv.extend(ohlcv)
            since = ohlcv[-1][0] + 1  # next timestamp
            await asyncio.sleep(0.1)  # rate limit
        except Exception as e:
            print(f"Error fetching OHLCV: {e}")
            break

    if not all_ohlcv:
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    df = pd.DataFrame(all_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
    df.set_index('timestamp', inplace=True)
    df = df[(df.index >= start_date) & (df.index <= end_date)]
    return df


def simulate_signal(
    signal: Dict[str, Any],
    ohlcv: pd.DataFrame,
    slippage_pct: float = 0.001,
    commission_pct: float = 0.001
) -> Optional[Dict[str, Any]]:
    """
    Simulate a single signal on OHLCV data.

    Returns a trade dict if the signal would have triggered and resulted in an exit (TP or SL).
    Returns None if signal never triggered within the data range.
    """
    direction = signal['direction']
    entry = signal['entry']
    tp1 = signal['tp1']
    tp2 = signal.get('tp2')
    sl = signal['sl']
    reason = signal.get('reason', '')

    # Find entry trigger: price must cross entry within tolerance
    tolerance = entry * slippage_pct
    if direction == 'LONG':
        # For LONG, trigger when low <= entry + tolerance (i.e., price comes down to entry)
        triggered_mask = (ohlcv['low'] <= entry + tolerance) & (ohlcv['close'] >= entry - tolerance)
    else:  # SHORT
        triggered_mask = (ohlcv['high'] >= entry - tolerance) & (ohlcv['close'] <= entry + tolerance)

    entry_idx = ohlcv[triggered_mask].index
    if len(entry_idx) == 0:
        return None  # never triggered

    entry_time = entry_idx[0]
    entry_price = entry  # assume we get filled at the signal entry price (could use open of that candle)

    # Now simulate from entry_time onwards
    post_ohlcv = ohlcv[ohlcv.index >= entry_time].copy()
    if post_ohlcv.empty:
        return None

    # Initialize
    position_open = True
    exit_price = None
    exit_reason = None
    exit_time = None

    for i, (ts, row) in enumerate(post_ohlcv.iterrows()):
        high = row['high']
        low = row['low']
        close = row['close']

        if direction == 'LONG':
            # Check TP1 first (if set)
            if tp1 and high >= tp1:
                exit_price = tp1
                exit_reason = 'TP1'
                exit_time = ts
                break
            # Check SL
            if low <= sl:
                exit_price = sl
                exit_reason = 'SL'
                exit_time = ts
                break
            # Check TP2 (only if TP1 not hit) - treat TP2 as final exit
            if tp2 and high >= tp2:
                exit_price = tp2
                exit_reason = 'TP2'
                exit_time = ts
                break
        else:  # SHORT
            if tp1 and low <= tp1:
                exit_price = tp1
                exit_reason = 'TP1'
                exit_time = ts
                break
            if high >= sl:
                exit_price = sl
                exit_reason = 'SL'
                exit_time = ts
                break
            if tp2 and low <= tp2:
                exit_price = tp2
                exit_reason = 'TP2'
                exit_time = ts
                break

    if exit_price is None:
        # Position never closed within data; assume close at last candle's close
        exit_price = post_ohlcv.iloc[-1]['close']
        exit_reason = 'END_OF_DATA'
        exit_time = post_ohlcv.index[-1]

    # Calculate PnL
    if direction == 'LONG':
        pnl_pct = (exit_price - entry_price) / entry_price * 100
        pnl_usd = (exit_price - entry_price) / entry_price * signal.get('size_usd', 1000)  # we don't know size here; will compute later
    else:
        pnl_pct = (entry_price - exit_price) / entry_price * 100
        pnl_usd = (entry_price - exit_price) / entry_price * signal.get('size_usd', 1000)

    return {
        'signal_id': signal.get('id'),
        'pair': signal['pair'],
        'direction': direction,
        'entry_time': entry_time,
        'entry_price': entry_price,
        'exit_time': exit_time,
        'exit_price': exit_price,
        'exit_reason': exit_reason,
        'pnl_pct': pnl_pct,
        'pnl_usd': pnl_usd,  # to be adjusted with size later
        'reason': reason
    }


async def run_backtest(
    db: AsyncSession,
    pair: str,
    start_date: datetime,
    end_date: datetime,
    initial_balance: float = 10000.0,
    risk_per_trade: float = 0.02,
    slippage_pct: float = 0.001,
    commission_pct: float = 0.001
) -> Dict[str, Any]:
    """
    Run a backtest over historical data.

    Steps:
    1. Fetch all EXECUTED signals for the pair within the date range.
    2. Fetch OHLCV data for the pair from Binance.
    3. For each signal, simulate the trade.
    4. Build equity curve from initial_balance.
    5. Calculate comprehensive metrics using calculate_advanced_metrics.
    """
    # Fetch signals
    stmt = select(Signal).where(
        Signal.pair == pair,
        Signal.status == 'EXECUTED',
        Signal.created_at >= start_date,
        Signal.created_at <= end_date
    ).order_by(Signal.created_at)
    result = await db.execute(stmt)
    signals = result.scalars().all()

    if not signals:
        return {
            "trades": [],
            "equity_curve": [],
            "stats": {"error": "No executed signals in this date range"}
        }

    # Fetch OHLCV
    ohlcv = await fetch_ohlcv(pair, start_date, end_date, timeframe='4h')  # 4h timeframe typical for signals
    if ohlcv.empty:
        return {"trades": [], "equity_curve": [], "stats": {"error": "No OHLCV data"}}

    # Simulate each signal
    balance = initial_balance
    equity_curve = []  # list of {timestamp, balance}
    trades = []
    max_equity = balance
    max_dd = 0.0

    for sig in signals:
        # Compute position size based on balance * risk_per_trade and SL distance
        # Here we use a simplified approach: risk amount = balance * risk_per_trade
        risk_amount = balance * risk_per_trade
        # Determine position size in USD such that if SL hit, loss = risk_amount
        # For LONG: loss_pct = (entry - sl) / entry
        loss_pct = abs(sig.entry - sig.sl) / sig.entry
        if loss_pct == 0:
            continue  # skip invalid
        position_size_usd = risk_amount / loss_pct
        # Add this size to the signal dict for simulation
        sig_dict = {
            'id': sig.id,
            'pair': sig.pair,
            'direction': sig.direction.value if hasattr(sig.direction, 'value') else sig.direction,
            'entry': sig.entry,
            'tp1': sig.tp1,
            'tp2': sig.tp2,
            'sl': sig.sl,
            'reason': sig.reason or '',
            'size_usd': position_size_usd
        }

        trade = simulate_signal(sig_dict, ohlcv, slippage_pct, commission_pct)
        if trade is None:
            continue

        # Deduct commission on entry and exit? Simplify: apply commission_pct on both sides, reduces effective entry/exit
        # We'll adjust entry and exit prices by commission (assume taker fee, 0.1% each side)
        # For LONG: effective entry = entry * (1 + commission_pct), exit = exit * (1 - commission_pct)
        # Actually commission is usually on notional; we'll subtract from PnL
        # Simpler: compute PnL after commission using size
        entry_price_comm = sig.entry * (1 + commission_pct)
        exit_price_comm = trade['exit_price'] * (1 - commission_pct)

        if sig_dict['direction'] == 'LONG':
            pnl_pct = (exit_price_comm - entry_price_comm) / entry_price_comm * 100
            pnl_usd = position_size_usd * (exit_price_comm - entry_price_comm) / entry_price_comm
        else:
            pnl_pct = (entry_price_comm - exit_price_comm) / entry_price_comm * 100
            pnl_usd = position_size_usd * (entry_price_comm - exit_price_comm) / entry_price_comm

        # Update balance
        balance += pnl_usd
        max_equity = max(max_equity, balance)
        dd_current = (balance - max_equity) / max_equity if max_equity > 0 else 0
        max_dd = min(max_dd, dd_current)

        # Record trade
        trades.append({
            'signal_id': sig.id,
            'pair': sig.pair,
            'direction': sig_dict['direction'],
            'entry_time': trade['entry_time'].isoformat(),
            'entry_price': trade['entry_price'],
            'exit_time': trade['exit_time'].isoformat(),
            'exit_price': trade['exit_price'],
            'exit_reason': trade['exit_reason'],
            'pnl_pct': round(pnl_pct, 2),
            'pnl_usd': round(pnl_usd, 2),
            'reason': sig.reason or '',
        })

        # Add equity point at exit
        equity_curve.append({
            'timestamp': trade['exit_time'].isoformat(),
            'balance': round(balance, 2)
        })

    # Final metrics
    trade_dicts = [
        {
            'pnl_pct': t['pnl_pct'],
            'pnl_usd': t['pnl_usd'],
            'opened_at': t['entry_time'],
            'closed_at': t['exit_time'],
        }
        for t in trades
    ]
    from app.utils.metrics import calculate_advanced_metrics
    advanced = calculate_advanced_metrics(trade_dicts)
    basic_stats = {
        'total_trades': len(trades),
        'initial_balance': initial_balance,
        'final_balance': round(balance, 2),
        'total_pnl': round(balance - initial_balance, 2),
        'total_pnl_pct': round((balance - initial_balance) / initial_balance * 100, 2),
        'max_drawdown_pct': round(max_dd * 100, 2),
    }

    return {
        "trades": trades,
        "equity_curve": equity_curve,
        "stats": {**basic_stats, **advanced}
    }
