import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Calendar helpers ───────────────────────────────────────────────────────
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function CalendarPnL({ daily }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build lookup: "YYYY-MM-DD" -> pnl
  const pnlMap = {};
  (daily || []).forEach(d => { pnlMap[d.date] = d.pnl; });

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = today.toISOString().split('T')[0];

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '16px' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>‹</button>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{viewYear}-{String(viewMonth + 1).padStart(2, '0')}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {dayNames.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const pnl = pnlMap[dateStr];
          const isToday = dateStr === todayStr;
          const hasData = pnl !== undefined;
          const isPositive = pnl >= 0;

          let bg = 'rgba(255,255,255,0.04)';
          let textColor = 'var(--text-muted)';
          if (hasData && pnl > 0) { bg = 'rgba(14,203,129,0.18)'; textColor = '#0ecb81'; }
          if (hasData && pnl < 0) { bg = 'rgba(246,70,93,0.18)'; textColor = '#f6465d'; }
          if (hasData && pnl === 0) { bg = 'rgba(255,255,255,0.06)'; textColor = 'var(--text-muted)'; }

          return (
            <div
              key={dateStr}
              title={hasData ? `${dateStr}\n${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : dateStr}
              style={{
                background: bg,
                borderRadius: '8px',
                padding: '8px 4px',
                textAlign: 'center',
                border: isToday ? '1px solid var(--accent-primary)' : '1px solid transparent',
                cursor: hasData ? 'default' : 'default',
                minHeight: '52px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: isToday ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: isToday ? 600 : 400 }}>
                {day}
              </div>
              {hasData && (
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: textColor }}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </div>
              )}
              {!hasData && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.15)' }}>0.00</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Journal() {
  const [trades, setTrades] = useState([]);
  const [dailyStats, setDailyStats] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const textRef = useRef(null);

  const fetchTrades = () => {
    fetch(`${API_URL}/api/v1/trades/`)
      .then(res => res.json())
      .then(data => setTrades(data))
      .catch(console.error);
  };

  const fetchDailyStats = () => {
    fetch(`${API_URL}/api/v1/trades/daily-stats`)
      .then(res => res.json())
      .then(data => setDailyStats(data))
      .catch(console.error);
  };

  useEffect(() => {
    fetchTrades();
    fetchDailyStats();
  }, []);

  useEffect(() => {
    if (editingId !== null && textRef.current) {
      textRef.current.focus();
    }
  }, [editingId]);

  const startEdit = (trade) => {
    setEditingId(trade.id);
    setDraftNote(trade.journal || '');
  };

  const saveNote = async (id) => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/v1/trades/${id}/journal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journal: draftNote }),
      });
      setEditingId(null);
      fetchTrades();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const pnlColor = (v) => v >= 0 ? 'var(--success)' : 'var(--danger)';
  const sign = (v) => v >= 0 ? '+' : '';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Trade Journal</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{trades.length} trades</span>
      </div>

      {/* ── Daily PnL Calendar ─────────────────────────────────────────────── */}
      {dailyStats && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Daily PnL</span>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem' }}>
              <span style={{ color: '#0ecb81' }}>🔥 {dailyStats.win_streak} win streak</span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--accent-primary)' }}>{dailyStats.trades_today} trades today</span>
              {dailyStats.loss_streak > 0 && <>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <span style={{ color: '#f6465d' }}>💀 {dailyStats.loss_streak} loss streak</span>
              </>}
            </div>
          </div>
          <CalendarPnL daily={dailyStats.daily} />
        </div>
      )}

      {/* ── Trade list ────────────────────────────────────────────────────── */}
      {trades.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          No closed trades yet — your journal will populate as positions close.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trades.map(t => (
            <div key={t.id} className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '120px' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{t.pair}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {t.exit_reason === 'TP1_PARTIAL' ? '½ close · TP1' : t.exit_reason}
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '160px' }}>
                  <div>Entry: <b style={{ color: '#fff' }}>${t.entry?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b></div>
                  <div>Exit: <b style={{ color: '#fff' }}>${t.exit?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b></div>
                </div>

                <div style={{ minWidth: '110px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: pnlColor(t.pnl_usd) }}>
                    {sign(t.pnl_usd)}${t.pnl_usd?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: pnlColor(t.pnl_pct) }}>
                    {sign(t.pnl_pct)}{t.pnl_pct?.toFixed(2)}%
                  </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flex: 1 }}>
                  <div>{t.opened_at ? new Date(t.opened_at).toLocaleString() : '—'}</div>
                  <div>→ {t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}</div>
                </div>

                <button
                  onClick={() => editingId === t.id ? setEditingId(null) : startEdit(t)}
                  className="btn"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    background: editingId === t.id ? 'rgba(240,185,11,0.15)' : 'rgba(255,255,255,0.07)',
                    color: editingId === t.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: `1px solid ${editingId === t.id ? 'rgba(240,185,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  ✏️ {editingId === t.id ? 'Cancel' : (t.journal ? 'Edit Note' : 'Add Note')}
                </button>
              </div>

              {editingId === t.id && (
                <div style={{ marginTop: '16px', animation: 'fadeIn 0.2s ease' }}>
                  <textarea
                    ref={textRef}
                    value={draftNote}
                    onChange={e => setDraftNote(e.target.value)}
                    placeholder="What happened? Why did you take this trade? What would you do differently?"
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(240,185,11,0.25)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '12px',
                      fontSize: '0.9rem',
                      lineHeight: '1.6',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button
                      onClick={() => saveNote(t.id)}
                      disabled={saving}
                      className="btn btn-primary"
                      style={{ padding: '8px 20px' }}
                    >
                      {saving ? 'Saving...' : '💾 Save Note'}
                    </button>
                  </div>
                </div>
              )}

              {editingId !== t.id && t.journal && (
                <div style={{
                  marginTop: '14px',
                  padding: '12px 14px',
                  background: 'rgba(240,185,11,0.04)',
                  borderLeft: '3px solid var(--accent-primary)',
                  borderRadius: '0 6px 6px 0',
                  fontSize: '0.88rem',
                  color: 'var(--text-main)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}>
                  {t.journal}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}