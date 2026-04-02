import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>}
      <div style={{ position: 'relative' }}>
        <pre style={{
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(240,185,11,0.12)',
          borderRadius: '8px', padding: '16px', overflowX: 'auto', fontSize: '0.85rem',
          color: '#e8e8e8', lineHeight: '1.6', margin: 0
        }}>
          <code>{code}</code>
        </pre>
        <button onClick={copy} style={{
          position: 'absolute', top: '8px', right: '8px',
          background: copied ? 'rgba(14,203,129,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${copied ? 'rgba(14,203,129,0.4)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: '6px', color: copied ? '#0ecb81' : 'var(--text-muted)',
          padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit'
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function Webhook() {
  const [testPayload, setTestPayload] = useState({
    secret: 'change_me',
    pair: 'BTC/USDT',
    direction: 'LONG',
    entry: 65000,
    tp1: 67000,
    tp2: 70000,
    sl: 63000,
    reason: 'Breakout long test',
    confidence: 'BUY'
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/webhooks/tradingview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, status: res.status, data });
    } catch (err) {
      setTestResult({ ok: false, status: 500, data: { detail: err.message } });
    } finally {
      setTesting(false);
    }
  };

  const tvAlertTemplate = `{
  "secret": "change_me",
  "pair": "{{ticker}}",
  "direction": "{{strategy.order.action}}",
  "entry": {{close}},
  "tp1": {{plot("TP1")}},
  "tp2": {{plot("TP2")}},
  "sl": {{plot("SL")}},
  "reason": "TV Alert — {{interval}}"
}`;

  const curlExample = `curl -X POST ${API_URL}/api/v1/webhooks/tradingview \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(testPayload, null, 2)}'`;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">TradingView Webhook</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Setup Guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel">
            <div style={{ fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📡</span> Endpoint
            </div>
            <CodeBlock label="POST URL" code={`${API_URL}/api/v1/webhooks/tradingview`} />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.7' }}>
              Send this URL in your TradingView alert. The <code style={{ color: '#f0b90b' }}>secret</code> field must match your <code style={{ color: '#f0b90b' }}>WEBHOOK_SECRET</code> env var.
            </div>
          </div>

          <div className="glass-panel">
            <div style={{ fontWeight: 600, marginBottom: '16px' }}>📋 TradingView Alert JSON Template</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Paste this into the TradingView alert message body (JSON tab). Replace <code style={{ color: '#f0b90b' }}>change_me</code> with your secret.
            </div>
            <CodeBlock code={tvAlertTemplate} />
          </div>

          <div className="glass-panel">
            <div style={{ fontWeight: 600, marginBottom: '16px' }}>🖥 cURL Test Example</div>
            <CodeBlock code={curlExample} />
          </div>

          <div className="glass-panel">
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>✅ Validation Rules</div>
            <ul style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '2', paddingLeft: '16px' }}>
              <li>Secret must match <code style={{ color: '#f0b90b' }}>WEBHOOK_SECRET</code></li>
              <li>LONG: <code style={{ color: '#0ecb81' }}>SL &lt; entry &lt; TP1 &lt; TP2</code></li>
              <li>SHORT: <code style={{ color: '#f6465d' }}>TP2 &lt; TP1 &lt; entry &lt; SL</code></li>
              <li>No duplicate PENDING signal for same pair+direction</li>
              <li>Respects MAX_POSITIONS limit from settings</li>
              <li>Automatically triggers Telegram alert</li>
            </ul>
          </div>
        </div>

        {/* Live Test Tool */}
        <div className="glass-panel" style={{ alignSelf: 'start' }}>
          <div style={{ fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔬</span> Live Test Tool
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            {[
              ['secret', 'text', 'Secret'],
              ['pair', 'text', 'Pair (e.g. BTC/USDT)'],
              ['entry', 'number', 'Entry Price'],
              ['tp1', 'number', 'TP1'],
              ['tp2', 'number', 'TP2'],
              ['sl', 'number', 'Stop Loss'],
              ['reason', 'text', 'Reason'],
            ].map(([key, type, label]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</label>
                <input
                  type={type}
                  step="any"
                  value={testPayload[key]}
                  onChange={e => setTestPayload(prev => ({ ...prev, [key]: type === 'number' ? parseFloat(e.target.value) || e.target.value : e.target.value }))}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                    color: '#fff', padding: '8px 12px', fontFamily: 'inherit', fontSize: '0.9rem'
                  }}
                />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Direction</label>
              <select
                value={testPayload.direction}
                onChange={e => setTestPayload(prev => ({ ...prev, direction: e.target.value }))}
                style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', padding: '8px 12px', fontFamily: 'inherit' }}
              >
                <option>LONG</option>
                <option>SHORT</option>
              </select>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '16px' }}
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? '⏳ Sending...' : '🚀 Send Test Webhook'}
          </button>

          {testResult && (
            <div style={{
              background: testResult.ok ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)',
              border: `1px solid ${testResult.ok ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)'}`,
              borderRadius: '8px', padding: '14px'
            }}>
              <div style={{ fontWeight: 600, color: testResult.ok ? '#0ecb81' : '#f6465d', marginBottom: '8px' }}>
                {testResult.ok ? '✅ Success' : `❌ Error ${testResult.status}`}
              </div>
              <pre style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
