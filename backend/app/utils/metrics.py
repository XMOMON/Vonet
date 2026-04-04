import numpy as np
from datetime import datetime
from typing import List, Dict, Any
from decimal import Decimal


def calculate_advanced_metrics(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate advanced performance metrics from a list of closed trades.

    Each trade dict must have:
      - pnl_pct: float (percentage gain/loss)
      - pnl_usd: Decimal or float
      - opened_at: datetime
      - closed_at: datetime

    Returns a dict with metric values (floats or ints). Returns empty dict if no trades.
    """
    if not trades:
        return {}

    # Convert to numpy arrays for speed
    pnls = np.array([float(t['pnl_pct']) for t in trades])
    wins = pnls[pnls > 0]
    losses = pnls[pnls < 0]

    num_trades = len(trades)
    num_wins = len(wins)
    num_losses = len(losses)

    win_rate = num_wins / num_trades if num_trades else 0.0

    avg_win = float(np.mean(wins)) if len(wins) else 0.0
    avg_loss = float(np.mean(losses)) if len(losses) else 0.0

    # Expectancy: average profit per trade (using percentages)
    expectancy = (win_rate * avg_win) - ((1 - win_rate) * abs(avg_loss))

    # Profit Factor = gross profit / gross loss
    gross_profit = float(np.sum(wins)) if len(wins) else 0.0
    gross_loss = abs(float(np.sum(losses))) if len(losses) else 0.0
    profit_factor = gross_profit / gross_loss if gross_loss else None

    # Max Drawdown based on cumulative PnL curve
    cumulative = np.cumsum(pnls)
    running_max = np.maximum.accumulate(cumulative)
    # Avoid division by zero; if running_max is zero at start, treat drawdown as 0
    denominator = np.where(running_max == 0, 1, running_max)
    drawdown = (cumulative - running_max) / denominator
    max_dd = float(np.min(drawdown)) if len(drawdown) else 0.0

    # Calmar Ratio = total return / abs(max_dd)
    total_return = float(cumulative[-1]) if len(cumulative) else 0.0
    calmar = total_return / abs(max_dd) if max_dd != 0 else None

    # Consecutive wins/losses streaks
    streaks = []
    current = 0
    for p in pnls:
        if p > 0:
            if current >= 0:
                current += 1
            else:
                current = 1
        elif p < 0:
            if current <= 0:
                current -= 1
            else:
                current = -1
        else:
            current = 0
        streaks.append(current)
    max_win_streak = max([s for s in streaks if s > 0], default=0)
    max_loss_streak = abs(min([s for s in streaks if s < 0], default=0))

    # Largest win/loss
    largest_win = float(np.max(wins)) if len(wins) else 0.0
    largest_loss = float(np.min(losses)) if len(losses) else 0.0

    # Holding times (seconds)
    holding_times = []
    win_holdings = []
    loss_holdings = []
    for t in trades:
        opened = t['opened_at']
        closed = t['closed_at']
        if isinstance(opened, str):
            opened = datetime.fromisoformat(opened.replace('Z', '+00:00'))
        if isinstance(closed, str):
            closed = datetime.fromisoformat(closed.replace('Z', '+00:00'))
        duration = (closed - opened).total_seconds()
        if t['pnl_pct'] > 0:
            win_holdings.append(duration)
        elif t['pnl_pct'] < 0:
            loss_holdings.append(duration)
        holding_times.append(duration)

    avg_holding = float(np.mean(holding_times)) if holding_times else 0.0
    avg_win_holding = float(np.mean(win_holdings)) if win_holdings else 0.0
    avg_loss_holding = float(np.mean(loss_holdings)) if loss_holdings else 0.0

    return {
        "num_trades": num_trades,
        "win_rate": round(win_rate * 100, 2),
        "avg_win_pct": round(avg_win, 2),
        "avg_loss_pct": round(avg_loss, 2),
        "expectancy": round(expectancy, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor is not None else None,
        "max_drawdown_pct": round(max_dd * 100, 2),
        "calmar_ratio": round(calmar, 2) if calmar is not None else None,
        "max_consecutive_wins": int(max_win_streak),
        "max_consecutive_losses": int(max_loss_streak),
        "largest_win_pct": round(largest_win, 2),
        "largest_loss_pct": round(largest_loss, 2),
        "avg_holding_seconds": round(avg_holding, 0),
        "avg_win_holding_seconds": round(avg_win_holding, 0),
        "avg_loss_holding_seconds": round(avg_loss_holding, 0),
    }
