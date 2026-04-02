import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function GaugeBar({ value, max = 100, colorFn }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = colorFn ? colorFn(pct) : '#f0b90b';
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '100px', height: '8px', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: '100px',
        background: color,
        transition: 'width 0.5s ease',
        boxShadow: `0 0 8px ${color}44`
      }} />
    </div>
  );
}

function StatCard({ label, value, sub, accent, warn, icon }) {
  const borderColor = warn ? 'rgba(246,70,93,0.4)' : 'rgba(240,185,11,0.12)';
  const bgColor = warn ? 'rgba(246,70,93,0.05)' : 'rgba(240,185,11,0.04)';
  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {icon && <span style={{ marginRight: '6px' }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: accent || 'var(--text-main)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: warn ? 'var(--danger)' : 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

export default function Risk() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRisk = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/risk/`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Risk fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisk();
    const iv = setInterval(fetchRisk, 5000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading risk data...</div>;
  if (!data) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--danger)' }}>Failed to load risk data.</div>;

  const posColor = (pct) => pct >= 80 ? '#f6465d' : pct >= 60 ? '#f0b90b' : '#0ecb81';
  const expColor = (pct) => pct >= 100 ? '#f6465d' : pct >= 70 ? '#f0b90b' : '#0ecb81';
  const pnlColor = (v) => v >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Risk Dashboard</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Live · refreshes every 5s</span>
      </div>

      {/* Warning banner */}
      {data.daily_loss_warning && (
        <div style={{
          background: 'rgba(246,70,93,0.12)', border: '1px solid rgba(246,70,93,0.4)',
          borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '12px',
          animation: 'pulse 1.5s infinite'
        }}>
          <span style={{ fontSize: '1.5rem' }}>🚨</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--danger)' }}>Daily Loss Limit Reached</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Daily PnL of ${data.daily_realized_pnl.toFixed(2)} exceeds {data.daily_loss_limit_pct}% limit (${data.daily_loss_limit_usd.toFixed(2)}). Consider pausing trading.
            </div>
          </div>
        </div>
      )}

      {/* Top KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <StatCard icon="💰" label="Account Equity" value={`$${data.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="var(--accent-primary)" />
        <StatCard icon="📊" label="Open Positions" value={`${data.open_positions} / ${data.max_positions}`}
          sub={`${data.positions_pct_full}% capacity used`}
          accent={posColor(data.positions_pct_full)}
          warn={data.positions_pct_full >= 100} />
        <StatCard icon="💸" label="Daily P&L" value={`${data.daily_realized_pnl >= 0 ? '+' : ''}$${data.daily_realized_pnl.toFixed(2)}`}
          accent={pnlColor(data.daily_realized_pnl)}
          sub={data.daily_loss_warning ? '⚠ Loss limit hit' : `Limit: $${data.daily_loss_limit_usd.toFixed(0)}`}
          warn={data.daily_loss_warning} />
        <StatCard icon="📉" label="Unrealized P&L" value={`${data.total_unrealized_pnl >= 0 ? '+' : ''}$${data.total_unrealized_pnl.toFixed(2)}`}
          accent={pnlColor(data.total_unrealized_pnl)} />
        <StatCard icon="⚡" label="Total Exposure" value={`$${data.total_exposure_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`${data.total_exposure_pct}% of balance`}
          accent={expColor(data.total_exposure_pct)}
          warn={data.total_exposure_pct >= 150} />
        <StatCard icon="📐" label="Net Exposure" value={`${data.net_exposure_usd >= 0 ? '+' : ''}$${data.net_exposure_usd.toFixed(0)}`}
          sub={data.net_exposure_usd >= 0 ? 'Net Long' : 'Net Short'}
          accent={data.net_exposure_usd >= 0 ? 'var(--success)' : 'var(--danger)'} />
      </div>

      {/* Capacity gauges row */}
      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: 600, marginBottom: '20px', color: 'var(--text-main)' }}>Capacity Gauges</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Positions ({data.open_positions}/{data.max_positions})</span>
              <span style={{ color: posColor(data.positions_pct_full), fontWeight: 600 }}>{data.positions_pct_full}%</span>
            </div>
            <GaugeBar value={data.positions_pct_full} colorFn={posColor} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Exposure ({data.total_exposure_pct}% of balance)</span>
              <span style={{ color: expColor(data.total_exposure_pct), fontWeight: 600 }}>${data.total_exposure_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <GaugeBar value={data.total_exposure_pct} max={200} colorFn={expColor} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Long Exposure</span>
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>${data.long_exposure_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '100px', height: '8px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min((data.long_exposure_usd / Math.max(data.total_exposure_usd, 1)) * 100, 100)}%`, background: '#0ecb81', borderRadius: '100px' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Short Exposure</span>
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>${data.short_exposure_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '100px', height: '8px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min((data.short_exposure_usd / Math.max(data.total_exposure_usd, 1)) * 100, 100)}%`, background: '#f6465d', borderRadius: '100px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Per-pair exposure table */}
      <div className="glass-panel">
        <div style={{ fontWeight: 600, marginBottom: '20px', color: 'var(--text-main)' }}>
          Exposure by Pair
          <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
            {data.pair_exposure.length} pairs open
          </span>
        </div>
        {data.pair_exposure.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No open positions — all clear ✅
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Direction(s)</th>
                <th>Positions</th>
                <th>Size (USD)</th>
                <th>% of Balance</th>
                <th>Unrealized P&L</th>
                <th>Exposure Bar</th>
              </tr>
            </thead>
            <tbody>
              {data.pair_exposure.map(p => (
                <tr key={p.pair}>
                  <td style={{ fontWeight: 600 }}>{p.pair}</td>
                  <td>
                    {[...new Set(p.directions)].map(d => (
                      <span key={d} className={`badge badge-${d === 'LONG' ? 'long' : 'short'}`} style={{ marginRight: '4px' }}>{d}</span>
                    ))}
                  </td>
                  <td>{p.count}</td>
                  <td style={{ fontWeight: 600 }}>${p.size_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ color: p.pct_of_balance >= 30 ? 'var(--danger)' : p.pct_of_balance >= 20 ? 'var(--warning)' : 'var(--text-main)' }}>
                    {p.pct_of_balance}%
                  </td>
                  <td style={{ color: p.unrealized_pnl >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {p.unrealized_pnl >= 0 ? '+' : ''}${p.unrealized_pnl.toFixed(2)}
                  </td>
                  <td style={{ width: '120px' }}>
                    <GaugeBar value={p.pct_of_balance} max={50} colorFn={(v) => v >= 30 ? '#f6465d' : v >= 20 ? '#f0b90b' : '#0ecb81'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
