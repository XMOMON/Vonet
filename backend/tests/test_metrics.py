import pytest
from app.utils.metrics import calculate_advanced_metrics


def test_calculate_advanced_metrics():
    trades = [
        {"pnl_pct": 5.0, "pnl_usd": 50, "opened_at": "2026-01-01T00:00:00", "closed_at": "2026-01-01T01:00:00"},
        {"pnl_pct": -2.0, "pnl_usd": -20, "opened_at": "2026-01-02T00:00:00", "closed_at": "2026-01-02T02:00:00"},
        {"pnl_pct": 3.0, "pnl_usd": 30, "opened_at": "2026-01-03T00:00:00", "closed_at": "2026-01-03T01:30:00"},
    ]
    result = calculate_advanced_metrics(trades)

    assert result["num_trades"] == 3
    assert result["win_rate"] == pytest.approx(66.67, rel=0.01)
    assert result["avg_win_pct"] == pytest.approx(4.0, rel=0.01)  # (5+3)/2 = 4
    assert result["avg_loss_pct"] == pytest.approx(-2.0, rel=0.01)
    assert result["max_consecutive_wins"] == 1
    assert result["max_consecutive_losses"] == 1
    assert result["largest_win_pct"] == 5.0
    assert result["largest_loss_pct"] == -2.0
    # Expectancy: 0.6667*4 - 0.3333*2 = 2.6667 - 0.6667 = 2.0
    assert result["expectancy"] == pytest.approx(2.0, rel=0.01)
    # Profit factor: gross profit 8 / gross loss 2 = 4.0
    assert result["profit_factor"] == pytest.approx(4.0, rel=0.01)


def test_calculate_advanced_metrics_empty():
    result = calculate_advanced_metrics([])
    assert result == {}
