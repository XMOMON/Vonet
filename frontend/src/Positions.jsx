import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Positions() {
  const [positions, setPositions] = useState([]);
  const [closing, setClosing] = useState(null);

  const fetchPositions = () => {
    fetch(`${API_URL}/api/v1/positions/`)
      .then(res => res.json())
      .then(data => setPositions(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleClose = async (positionId) => {
    if (!window.confirm('Manually close this position at current price?')) return;
    setClosing(positionId);
    try {
      const res = await fetch(`${API_URL}/api/v1/positions/${positionId}/close`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchPositions();
      } else {
        const err = await res.json();
        alert(`Error: ${err.detail}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setClosing(null);
    }
  };

  const calcPnlPct = (pos) => {
    if (!pos.current_price || pos.entry === 0) return 0;
    if (pos.direction === 'LONG') {
      return ((pos.current_price - pos.entry) / pos.entry) * 100;
    } else {
      return ((pos.entry - pos.current_price) / pos.entry) * 100;
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Active Positions</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {positions.length} open position{positions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Dir</th>
              <th>Size</th>
              <th>Entry</th>
              <th>Current</th>
              <th>TP1 / TP2</th>
              <th>SL</th>
              <th>Unrealized PnL</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No active positions — add a signal and wait for entry to trigger
              </td></tr>
            ) : (
              positions.map(p => {
                const pnlPct = calcPnlPct(p);
                const pnlColor = (p.pnl_usd || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.pair}</td>
                    <td><span className={`badge ${p.direction === 'LONG' ? 'badge-long' : 'badge-short'}`}>{p.direction}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>${(p.size_usd || 0).toFixed(2)}</td>
                    <td>${p.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                    <td style={{ fontWeight: 500 }}>
                      ${p.current_price ? p.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '---'}
                    </td>
                    <td style={{ color: 'var(--success)', fontSize: '0.85rem' }}>
                      {p.tp1?.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {p.tp2?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                      {p.sl?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: pnlColor, fontSize: '1rem' }}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                        </span>
                        <span style={{ color: pnlColor, fontSize: '0.85rem' }}>
                          {(p.pnl_usd || 0) >= 0 ? '+' : ''}${(p.pnl_usd || 0).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td><span className={`badge ${p.status === 'PARTIAL' ? 'badge-long' : 'badge-open'}`}>{p.status}</span></td>
                    <td>
                      <button
                        onClick={() => handleClose(p.id)}
                        disabled={closing === p.id}
                        style={{
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          background: 'rgba(246,70,93,0.12)',
                          color: '#f6465d',
                          border: '1px solid rgba(246,70,93,0.3)',
                          borderRadius: '6px',
                          cursor: closing === p.id ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {closing === p.id ? 'Closing...' : '✕ Close'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}