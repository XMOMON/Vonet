import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [pairStats, setPairStats] = useState([]);

  const fetchStats = () => {
    fetch(`${API_URL}/api/v1/stats/`)
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error(err));
  };

  const fetchPairStats = () => {
    fetch(`${API_URL}/api/v1/stats/pairs`)
      .then(res => res.json())
      .then(data => setPairStats(data))
      .catch(err => console.error(err));
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/export/trades`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `paper_trader_${dateStr}.xlsx`;
      
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchPairStats();
    const interval = setInterval(() => { fetchStats(); fetchPairStats(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="animate-fade-in"><p style={{ color: 'var(--text-muted)', padding: '40px' }}>Loading stats...</p></div>;

  const pnlColor = stats.realized_pnl >= 0 ? 'var(--success)' : 'var(--danger)';
  const ddColor = stats.max_drawdown > 15 ? 'var(--danger)' : stats.max_drawdown > 5 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Performance Stats</h1>
        <button
          id="export-csv-btn"
          className="btn btn-primary"
          onClick={handleExportCSV}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          📥 Export Excel
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid-cards">
        <div className="glass-panel">
          <div className="form-label">Account Balance</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
            ${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Started at ${stats.starting_balance.toLocaleString()}
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Realized PnL</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: pnlColor }}>
            {stats.realized_pnl >= 0 ? '+' : ''}${stats.realized_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Unrealized: ${stats.unrealized_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Win Rate</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: stats.win_rate >= 50 ? 'var(--success)' : 'var(--warning)' }}>
            {stats.win_rate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            {stats.wins}W / {stats.total_trades - stats.wins}L of {stats.total_trades} trades
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Avg PnL / Trade</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: stats.avg_pnl_pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {stats.avg_pnl_pct.toFixed(2)}%
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Best Trade</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--success)' }}>
            ${stats.best_trade.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Worst Trade</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--danger)' }}>
            ${stats.worst_trade.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Max Drawdown card */}
        <div className="glass-panel">
          <div className="form-label">Max Drawdown</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: ddColor }}>
            {stats.max_drawdown.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Peak-to-trough decline</div>
        </div>
      </div>

      {/* Account Summary Table */}
      <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Account Summary</h2>
      <div className="glass-panel">
        <table className="data-table">
          <tbody>
            <tr><td style={{ color: 'var(--text-muted)' }}>Starting Balance</td><td style={{ textAlign: 'right', fontWeight: 600 }}>${stats.starting_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style={{ color: 'var(--text-muted)' }}>Realized PnL</td><td style={{ textAlign: 'right', fontWeight: 600, color: pnlColor }}>{stats.realized_pnl >= 0 ? '+' : ''}${stats.realized_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style={{ color: 'var(--text-muted)' }}>Unrealized PnL</td><td style={{ textAlign: 'right', fontWeight: 600, color: stats.unrealized_pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>${stats.unrealized_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style={{ color: 'var(--text-muted)' }}>Current Balance</td><td style={{ textAlign: 'right', fontWeight: 600 }}>${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style={{ color: 'var(--text-muted)' }}>Equity</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-primary)' }}>${stats.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
            <tr><td style={{ color: 'var(--text-muted)' }}>Max Drawdown</td><td style={{ textAlign: 'right', fontWeight: 600, color: ddColor }}>{stats.max_drawdown.toFixed(2)}%</td></tr>
          </tbody>
        </table>
      </div>

      {/* Per-Pair Breakdown */}
      {pairStats.length > 0 && (
        <>
          <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Per-Pair Breakdown</h2>
          <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th style={{ textAlign: 'right' }}>Trades</th>
                  <th style={{ textAlign: 'right' }}>Win Rate</th>
                  <th style={{ textAlign: 'right' }}>Avg PnL %</th>
                  <th style={{ textAlign: 'right' }}>Total PnL</th>
                </tr>
              </thead>
              <tbody>
                {pairStats.map(p => (
                  <tr key={p.pair}>
                    <td style={{ fontWeight: 600 }}>{p.pair}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.trades}</td>
                    <td style={{ textAlign: 'right', color: p.win_rate >= 50 ? 'var(--success)' : 'var(--warning)' }}>{p.win_rate}%</td>
                    <td style={{ textAlign: 'right', color: p.avg_pnl_pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {p.avg_pnl_pct >= 0 ? '+' : ''}{p.avg_pnl_pct}%
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: p.total_pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {p.total_pnl >= 0 ? '+' : ''}${p.total_pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
