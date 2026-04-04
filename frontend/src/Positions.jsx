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

  // Leveraged PnL percentage (based on margin)
  const calcLevPnlPct = (pos) => {
    const margin = pos.margin_usd || (pos.size_usd / (pos.leverage || 30));
    if (!margin || margin === 0) return 0;
    return ((pos.pnl_usd || 0) / margin) * 100;
  };

  // Proximity to liquidation (0–100%)
  const calcLiqProximity = (pos) => {
    if (!pos.liq_price || !pos.current_price || !pos.entry) return 0;
    const totalRange = Math.abs(pos.entry - pos.liq_price);
    const moved = Math.abs(pos.current_price - pos.entry);
    if (totalRange === 0) return 0;
    return Math.min(100, (moved / totalRange) * 100);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 className="page-title">Active Positions</h1>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px',
            borderRadius: '20px', background: 'rgba(240,185,11,0.12)',
            color: '#f0b90b', border: '1px solid rgba(240,185,11,0.3)',
            letterSpacing: '0.05em'
          }}>
            ⚡ FUTURES
          </span>
        </div>
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
              <th>Lev</th>
              <th>Margin</th>
              <th>Entry</th>
              <th>Current</th>
              <th>Liq. Price</th>
              <th>TP1 / TP2</th>
              <th>SL</th>
              <th>Leveraged PnL</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan="12" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No active futures positions — add a signal to open one
              </td></tr>
            ) : (
              positions.map(p => {
                const levPct = calcLevPnlPct(p);
                const pnlColor = (p.pnl_usd || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
                const liqProx = calcLiqProximity(p);
                const liqBarColor = liqProx > 75 ? '#f6465d' : liqProx > 50 ? '#f0b90b' : '#0ecb81';
                const leverage = p.leverage || 30;
                const margin = p.margin_usd || (p.size_usd / leverage);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.pair}</td>
                    <td><span className={`badge ${p.direction === 'LONG' ? 'badge-long' : 'badge-short'}`}>{p.direction}</span></td>
                    <td>
                      <span style={{
                        fontWeight: 700, fontSize: '0.85rem', color: '#f0b90b',
                        background: 'rgba(240,185,11,0.1)', padding: '2px 7px',
                        borderRadius: '6px', border: '1px solid rgba(240,185,11,0.25)'
                      }}>
                        x{leverage}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      ${margin.toFixed(2)}
                    </td>
                    <td>${p.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                    <td style={{ fontWeight: 500 }}>
                      ${p.current_price ? p.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '---'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ color: '#f6465d', fontSize: '0.85rem', fontWeight: 600 }}>
                          ${p.liq_price?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || '---'}
                        </span>
                        {/* Liquidation proximity bar */}
                        <div style={{ width: '60px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${liqProx}%`,
                            background: liqBarColor, transition: 'width 0.5s, background 0.5s',
                            borderRadius: '2px'
                          }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--success)', fontSize: '0.85rem' }}>
                      {p.tp1?.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {p.tp2?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                      {p.sl?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 700, color: pnlColor, fontSize: '1rem' }}>
                          {levPct >= 0 ? '+' : ''}{levPct.toFixed(2)}%
                        </span>
                        <span style={{ color: pnlColor, fontSize: '0.85rem' }}>
                          {(p.pnl_usd || 0) >= 0 ? '+' : ''}${(p.pnl_usd || 0).toFixed(2)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          notional ${(p.size_usd || 0).toFixed(0)}
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