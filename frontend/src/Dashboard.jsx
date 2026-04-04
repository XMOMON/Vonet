import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Equity Curve Chart ───────────────────────────────────────────────────────
function EquityCurve() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const load = () => {
      fetch(`${API_URL}/api/v1/stats/history`)
        .then(r => r.json())
        .then(data => {
          // Downsample if too many points
          const step = Math.max(1, Math.floor(data.length / 200));
          setHistory(data.filter((_, i) => i % step === 0).map(d => ({
            ...d,
            time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          })));
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const pnl = d.equity - 10000;
    const color = pnl >= 0 ? '#0ecb81' : '#f6465d';
    return (
      <div style={{ background: '#1a1a2e', border: '1px solid rgba(240,185,11,0.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem' }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{d.time}</div>
        <div style={{ color: '#f0b90b', fontWeight: 600 }}>Equity: ${d.equity?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div style={{ color }}>PnL: {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>
      </div>
    );
  };

  if (history.length < 2) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Equity curve will appear after trading begins...
      </div>
    );
  }

  const minVal = Math.min(...history.map(d => d.equity));
  const maxVal = Math.max(...history.map(d => d.equity));
  const padding = (maxVal - minVal) * 0.1 || 50;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f0b90b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f0b90b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="time" tick={{ fill: '#848e9c', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[minVal - padding, maxVal + padding]} tick={{ fill: '#848e9c', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} width={70} />
        <ReferenceLine y={10000} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="equity" stroke="#f0b90b" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#f0b90b' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Portfolio Heatmap ────────────────────────────────────────────────────────
function PortfolioHeatmap() {
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const load = () => {
      fetch(`${API_URL}/api/v1/positions/`)
        .then(r => r.json())
        .then(setPositions)
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  const open = positions.filter(p => p.status === 'OPEN' || p.status === 'PARTIAL');

  if (open.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '20px 0' }}>No open positions — heatmap will appear when you have active trades.</p>;
  }

  const getColor = (pct) => {
    // With 30x leverage, 3% real move = 90% leveraged move, so scale thresholds
    if (pct > 50) return { bg: 'rgba(14,203,129,0.25)', border: 'rgba(14,203,129,0.5)', text: '#0ecb81' };
    if (pct > 0) return { bg: 'rgba(14,203,129,0.1)', border: 'rgba(14,203,129,0.25)', text: '#0ecb81' };
    if (pct > -20) return { bg: 'rgba(246,70,93,0.08)', border: 'rgba(246,70,93,0.2)', text: '#f6465d' };
    return { bg: 'rgba(246,70,93,0.22)', border: 'rgba(246,70,93,0.5)', text: '#f6465d' };
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
      {open.map(p => {
        const leverage = p.leverage || 30;
        const margin = p.margin_usd || (p.size_usd / leverage);
        const pnlPct = margin > 0 ? (p.pnl_usd / margin) * 100 : 0;  // leveraged %
        const c = getColor(pnlPct);
        const sign = p.pnl_usd >= 0 ? '+' : '';
        return (
          <div key={p.id} style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: '10px',
            padding: '14px',
            transition: 'transform 0.2s',
            cursor: 'default',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.pair}</div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f0b90b', background: 'rgba(240,185,11,0.1)', padding: '1px 5px', borderRadius: '4px' }}>x{leverage}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {p.direction} {p.status === 'PARTIAL' ? '· ½ rem.' : ''}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: c.text }}>
              {sign}${p.pnl_usd?.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: c.text }}>
              {sign}{pnlPct.toFixed(1)}% lev.
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Margin: ${margin.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => {
      fetch(`${API_URL}/api/v1/stats/`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  const pnlColor = stats ? (stats.realized_pnl >= 0 ? 'var(--success)' : 'var(--danger)') : '#fff';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 className="page-title">Dashboard</h1>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px',
            borderRadius: '20px', background: 'rgba(240,185,11,0.12)',
            color: '#f0b90b', border: '1px solid rgba(240,185,11,0.3)',
            letterSpacing: '0.05em'
          }}>
            ⚡ FUTURES
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-cards" style={{ marginBottom: '30px' }}>
        <div className="glass-panel">
          <div className="form-label">Realized PnL</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: pnlColor }}>
            {stats ? `${stats.realized_pnl >= 0 ? '+' : ''}$${stats.realized_pnl.toFixed(2)}` : '—'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Unrealized: {stats ? `$${stats.unrealized_pnl.toFixed(2)}` : '—'}
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Win Rate</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: stats?.win_rate >= 50 ? 'var(--success)' : 'var(--warning)' }}>
            {stats ? `${stats.win_rate.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {stats ? `${stats.wins}W / ${stats.total_trades - stats.wins}L` : '—'}
          </div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Max Drawdown</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: stats?.max_drawdown > 10 ? 'var(--danger)' : 'var(--warning)' }}>
            {stats ? `${stats.max_drawdown.toFixed(2)}%` : '—'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Peak-to-trough</div>
        </div>

        <div className="glass-panel">
          <div className="form-label">Total Trades</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            {stats?.total_trades ?? '—'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Avg: {stats ? `${stats.avg_pnl_pct.toFixed(2)}% / trade` : '—'}
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>📈 Equity Curve</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Starting balance: $10,000</span>
        </div>
        <EquityCurve />
      </div>

      {/* Portfolio Heatmap */}
      <div className="glass-panel">
        <h2 style={{ margin: '0 0 18px 0', fontSize: '1rem', fontWeight: 600 }}>🗂️ Portfolio Heatmap</h2>
        <PortfolioHeatmap />
      </div>
    </div>
  );
}
