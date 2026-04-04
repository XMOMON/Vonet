import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CRYPTO_PAIRS = [
  "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "MATIC/USDT", "LINK/USDT",
  "DOT/USDT", "SHIB/USDT", "LTC/USDT", "UNI/USDT", "ATOM/USDT", "XLM/USDT", "VET/USDT", "FIL/USDT", "THETA/USDT", "XMR/USDT",
  "EOS/USDT", "AAVE/USDT", "XTZ/USDT", "MKR/USDT", "BSV/USDT", "BCH/USDT", "TRX/USDT", "NEO/USDT", "CAKE/USDT", "ALGO/USDT",
];

const defaultForm = {
  pair: 'BTC/USDT',
  direction: 'LONG',
  entry: '',
  tp1: '',
  tp2: '',
  sl: '',
  reason: '',
  confidence: 'BUY',
  source: 'Manual',
  notes: '',
  expires_at: '',
  leverage: 30
};


export default function Signals() {
  const [signals, setSignals] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [expandedNote, setExpandedNote] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [loadedTemplate, setLoadedTemplate] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);

  const fetchSignals = () => {
    fetch(`${API_URL}/api/v1/signals/`)
      .then(res => res.json())
      .then(data => setSignals(data))
      .catch(err => console.error(err));
  };

  const fetchTemplates = () => {
    fetch(`${API_URL}/api/v1/templates/`)
      .then(res => res.json())
      .then(data => setTemplates(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchSignals();
    fetchTemplates();
    const interval = setInterval(fetchSignals, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCancel = async (id) => {
    try {
      await fetch(`${API_URL}/api/v1/signals/${id}`, { method: 'DELETE' });
      fetchSignals();
    } catch (err) {
      console.error('Error cancelling signal:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: ['entry', 'tp1', 'tp2', 'sl'].includes(name) ? parseFloat(value) || value : value };
      
      // Auto-calculate TP/SL based on loaded template if entry changes
      if (name === 'entry' && loadedTemplate && updated.entry) {
        const entry = parseFloat(updated.entry);
        if (!isNaN(entry)) {
          if (loadedTemplate.tp1_pct != null) updated.tp1 = parseFloat((entry * (1 + loadedTemplate.tp1_pct / 100)).toFixed(6));
          if (loadedTemplate.tp2_pct != null) updated.tp2 = parseFloat((entry * (1 + loadedTemplate.tp2_pct / 100)).toFixed(6));
          if (loadedTemplate.sl_pct != null) updated.sl = parseFloat((entry * (1 + loadedTemplate.sl_pct / 100)).toFixed(6));
        }
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (!payload.expires_at) delete payload.expires_at;
      const response = await fetch(`${API_URL}/api/v1/signals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setShowModal(false);
        fetchSignals();
      } else {
        console.error('Failed to create signal:', await response.text());
      }
    } catch (err) {
      console.error('Error submitting signal:', err);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    const entry = parseFloat(formData.entry) || 1;
    const tp1 = parseFloat(formData.tp1) || 0;
    const tp2 = parseFloat(formData.tp2) || 0;
    const sl = parseFloat(formData.sl) || 0;
    const tp1_pct = entry ? ((tp1 - entry) / entry * 100) : null;
    const tp2_pct = entry ? ((tp2 - entry) / entry * 100) : null;
    const sl_pct = entry ? ((sl - entry) / entry * 100) : null;

    try {
      if (editingTemplateId) {
        await fetch(`${API_URL}/api/v1/templates/${editingTemplateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: templateName, pair: formData.pair, direction: formData.direction,
            tp1_pct, tp2_pct, sl_pct, confidence: formData.confidence,
            reason: formData.reason, notes: formData.notes,
          })
        });
        setEditingTemplateId(null);
      } else {
        await fetch(`${API_URL}/api/v1/templates/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: templateName, pair: formData.pair, direction: formData.direction,
            tp1_pct, tp2_pct, sl_pct, confidence: formData.confidence,
            reason: formData.reason, notes: formData.notes,
          })
        });
      }
      setTemplateName('');
      setShowSaveTemplate(false);
      fetchTemplates();
    } catch (err) {
      console.error('Error saving template:', err);
    }
  };

  const handleLoadTemplate = (tpl, isEdit = false) => {
    const entry = parseFloat(formData.entry) || 0;
    setFormData(prev => ({
      ...prev,
      pair: tpl.pair,
      direction: tpl.direction,
      confidence: tpl.confidence || 'BUY',
      reason: tpl.reason || '',
      notes: tpl.notes || '',
      ...(entry && tpl.tp1_pct != null ? { tp1: parseFloat((entry * (1 + tpl.tp1_pct / 100)).toFixed(6)) } : {}),
      ...(entry && tpl.tp2_pct != null ? { tp2: parseFloat((entry * (1 + tpl.tp2_pct / 100)).toFixed(6)) } : {}),
      ...(entry && tpl.sl_pct != null ? { sl: parseFloat((entry * (1 + tpl.sl_pct / 100)).toFixed(6)) } : {}),
    }));
    setLoadedTemplate(tpl);
    if (isEdit) {
      setEditingTemplateId(tpl.id);
      setTemplateName(tpl.name);
      setShowSaveTemplate(true);
    } else {
      setEditingTemplateId(null);
      setTemplateName('');
      setShowSaveTemplate(false);
    }
    setShowTemplates(false);
    setShowModal(true);
  };

  const handleDeleteTemplate = async (id) => {
    await fetch(`${API_URL}/api/v1/templates/${id}`, { method: 'DELETE' });
    fetchTemplates();
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', padding: '8px', borderRadius: '4px', width: '100%', fontFamily: 'inherit'
  };

  return (
    <>
      <div className="animate-fade-in relative h-full">
        <div className="page-header">
          <h1 className="page-title">Signals</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" style={{ background: 'rgba(240,185,11,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(240,185,11,0.2)' }}
              onClick={() => { setShowTemplates(true); fetchTemplates(); }}>
              Templates
            </button>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              + New Signal
            </button>
          </div>
        </div>

      {/* Templates Panel */}
      {showTemplates && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '520px', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 600 }}>Signal Templates</h2>
              <button onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem' }}>x</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No templates yet. Create a signal and save it as a template.
                </div>
              ) : (
                templates.map(tpl => (
                  <div key={tpl.id} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px', padding: '14px', marginBottom: '10px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{tpl.name}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--accent-primary)' }}>{tpl.pair}</span>
                        <span className={`badge badge-${tpl.direction === 'LONG' ? 'long' : 'short'}`}>{tpl.direction}</span>
                        {tpl.confidence && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tpl.confidence.replace('_', ' ')}</span>}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {tpl.tp1_pct != null && <span>TP1: {tpl.direction === 'LONG' ? '+' : ''}{tpl.tp1_pct?.toFixed(1)}%  </span>}
                        {tpl.tp2_pct != null && <span>TP2: {tpl.tp2_pct?.toFixed(1)}%  </span>}
                        {tpl.sl_pct != null && <span>SL: {tpl.sl_pct?.toFixed(1)}%</span>}
                      </div>
                      {tpl.reason && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{tpl.reason}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '10px' }}>
                      <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                        onClick={() => handleLoadTemplate(tpl, false)}>Load</button>
                      <button className="btn" style={{ padding: '6px 14px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', color: '#fff' }}
                        onClick={() => handleLoadTemplate(tpl, true)}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                        onClick={() => handleDeleteTemplate(tpl.id)}>Del</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signal Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '440px', maxHeight: '100%', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.2rem', fontWeight: 600 }}>Create New Signal</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pair</label>
                  <input type="text" name="pair" value={formData.pair} onChange={handleInputChange} required style={inputStyle} list="pairs-list" />
                  <datalist id="pairs-list">{CRYPTO_PAIRS.map(p => <option key={p} value={p} />)}</datalist>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Direction</label>
                  <select name="direction" value={formData.direction} onChange={handleInputChange} style={{ ...inputStyle, background: 'var(--bg-panel)' }}>
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                </div>
              </div>

              {/* Leverage Row */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  ⚡ Leverage <span style={{ color: '#f0b90b', fontWeight: 700 }}>x{formData.leverage}</span>
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[5, 10, 20, 25, 30, 50, 75, 100].map(lev => (
                    <button
                      key={lev}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, leverage: lev }))}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        border: `1px solid ${formData.leverage === lev ? '#f0b90b' : 'rgba(255,255,255,0.1)'}`,
                        background: formData.leverage === lev ? 'rgba(240,185,11,0.15)' : 'rgba(255,255,255,0.04)',
                        color: formData.leverage === lev ? '#f0b90b' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      x{lev}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Entry Price</label>
                <input type="number" step="any" name="entry" value={formData.entry} onChange={handleInputChange} required style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {[['tp1', 'TP1'], ['tp2', 'TP2'], ['sl', 'Stop Loss']].map(([name, label]) => (
                  <div key={name} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</label>
                    <input type="number" step="any" name={name} value={formData[name]} onChange={handleInputChange} required style={inputStyle} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Confidence</label>
                  <select name="confidence" value={formData.confidence} onChange={handleInputChange} style={{ ...inputStyle, background: 'var(--bg-panel)' }}>
                    <option value="STRONG_BUY">STRONG BUY</option>
                    <option value="BUY">BUY</option>
                    <option value="NEUTRAL">NEUTRAL</option>
                    <option value="SELL">SELL</option>
                    <option value="STRONG_SELL">STRONG SELL</option>
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Source</label>
                  <input type="text" name="source" value={formData.source} onChange={handleInputChange} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reason</label>
                <textarea name="reason" value={formData.reason} onChange={handleInputChange} placeholder="Short reason..." style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Notes / Analysis</label>
                <textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Multi-timeframe analysis, key levels..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Expires At (optional)</label>
                <input type="datetime-local" name="expires_at" value={formData.expires_at} onChange={handleInputChange} style={{ ...inputStyle, background: 'var(--bg-panel)' }} />
              </div>

              {/* Save as Template inline */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
                {!showSaveTemplate ? (
                  <button type="button" onClick={() => setShowSaveTemplate(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                    Save as template...
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Template name (e.g. BTC breakout long)"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="button" className="btn" style={{ padding: '8px 14px', background: 'rgba(240,185,11,0.15)', color: 'var(--accent-primary)', border: '1px solid rgba(240,185,11,0.3)' }}
                      onClick={handleSaveTemplate}>{editingTemplateId ? 'Update' : 'Save'}</button>
                    <button type="button" onClick={() => { setShowSaveTemplate(false); setEditingTemplateId(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>x</button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" onClick={() => { setShowModal(false); setShowSaveTemplate(false); }} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.07)', color: '#fff' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Signal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Dir</th>
              <th>Lev</th>
              <th>Entry</th>
              <th>TP1</th>
              <th>TP2</th>
              <th>SL</th>
              <th>R:R</th>
              <th>Confidence</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 ? (
              <tr><td colSpan="11" style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>No signals yet -- click + New Signal to get started</td></tr>
            ) : (
              signals.map(s => {
                const statusStyle = s.status === 'PENDING'
                  ? { background: 'rgba(240,185,11,0.1)', color: '#f0b90b', border: '1px solid rgba(240,185,11,0.3)' }
                  : s.status === 'EXECUTED'
                  ? { background: 'rgba(14,203,129,0.1)', color: '#0ecb81', border: '1px solid rgba(14,203,129,0.3)' }
                  : { background: 'rgba(132,142,156,0.1)', color: '#848e9c', border: '1px solid rgba(132,142,156,0.3)' };
                return (
                  <React.Fragment key={s.id}>
                    <tr style={{ opacity: s.status === 'CANCELLED' ? 0.5 : 1 }}>
                      <td style={{fontWeight: 600}}>
                        {s.pair}
                        {s.source === 'tradingview' && <span title="TradingView signal" style={{ marginLeft: '6px', fontSize: '0.75rem', color: '#f0b90b', background: 'rgba(240,185,11,0.1)', padding: '1px 6px', borderRadius: '8px' }}>TV</span>}
                        {s.notes && (
                          <span onClick={() => setExpandedNote(expandedNote === s.id ? null : s.id)}
                            style={{marginLeft: '8px', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.7}} title="View notes">note</span>
                        )}
                      </td>
                      <td><span className={`badge ${s.direction === 'LONG' ? 'badge-long' : 'badge-short'}`}>{s.direction}</span></td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f0b90b', background: 'rgba(240,185,11,0.1)', padding: '2px 7px', borderRadius: '6px', border: '1px solid rgba(240,185,11,0.25)' }}>
                          x{s.leverage || 30}
                        </span>
                      </td>
                      <td>${s.entry?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}</td>
                      <td style={{color: 'var(--success)', fontSize: '0.9rem'}}>{s.tp1?.toLocaleString(undefined, {maximumFractionDigits: 4})}</td>
                      <td style={{color: 'var(--success)', fontSize: '0.9rem'}}>{s.tp2?.toLocaleString(undefined, {maximumFractionDigits: 4})}</td>
                      <td style={{color: 'var(--danger)', fontSize: '0.9rem'}}>{s.sl?.toLocaleString(undefined, {maximumFractionDigits: 4})}</td>
                      <td style={{fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)'}}>
                        {s.entry && s.sl && s.tp2 && (s.entry - s.sl) !== 0
                          ? (() => {
                              const rr = s.direction === 'LONG'
                                ? ((s.tp2 - s.entry) / (s.entry - s.sl))
                                : ((s.entry - s.tp2) / (s.sl - s.entry));
                              return `${rr.toFixed(1)}R`;
                            })()
                          : '--'
                        }
                      </td>
                      <td><span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{s.confidence?.replace('_', ' ')}</span></td>
                      <td>
                        <span className="badge" style={{...statusStyle, padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600}}>
                          {s.status === 'PENDING' && <span style={{display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#f0b90b', marginRight: '6px', animation: 'pulse 1.5s infinite'}}></span>}
                          {s.status === 'EXECUTED' && 'v '}
                          {s.status}
                        </span>
                      </td>
                      <td style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{new Date(s.created_at).toLocaleString()}</td>
                      <td>
                        {s.status === 'PENDING' && (
                          <button onClick={() => handleCancel(s.id)} className="btn btn-danger" style={{padding: '4px 12px', fontSize: '0.8rem'}}>Cancel</button>
                        )}
                      </td>
                    </tr>
                    {expandedNote === s.id && s.notes && (
                      <tr>
                        <td colSpan="11" style={{padding: '12px 20px', background: 'rgba(240,185,11,0.03)', borderLeft: '3px solid var(--accent-primary)'}}>
                          <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600}}>ANALYSIS NOTES</div>
                          <div style={{fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: '1.5'}}>{s.notes}</div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
