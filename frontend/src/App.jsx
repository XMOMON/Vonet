import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Dashboard from './Dashboard';
import Positions from './Positions';
import Signals from './Signals';
import Stats from './Stats';
import Journal from './Journal';
import Risk from './Risk';
import Webhook from './Webhook';
import { useAppWebsocket } from './useAppWebsocket';
import './index.css';

function Navigation({ lastMessage }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'active' : '';
  const [balanceData, setBalanceData] = useState(null);

  const fetchBalance = () => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/stats/balance`)
      .then(res => res.json())
      .then(data => setBalanceData(data))
      .catch(console.error);
  };

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 3000); // 3 sec live polling
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="sidebar">
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <img src="/alphahook-logo.svg" alt="AlphaHook" height="128" width="128" style={{ filter: 'drop-shadow(0 0 12px rgba(240,185,11,0.5))' }} />
        <span style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-1px' }}>AlphaHook</span>
      </div>
      
      {/* Account Widget */}
      <div style={{ margin: '0 20px 30px', padding: '15px', background: 'rgba(240,185,11,0.04)', borderRadius: '12px', border: '1px solid rgba(240,185,11,0.12)' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Account Equity</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
          ${balanceData?.equity != null ? balanceData.equity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '---'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.85rem' }}>
           <span style={{ color: 'var(--text-muted)' }}>Balance</span>
           <span>${balanceData?.balance != null ? balanceData.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '---'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.85rem' }}>
           <span style={{ color: 'var(--text-muted)' }}>Open PnL</span>
           <span style={{ color: balanceData?.unrealized_pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
             ${balanceData?.unrealized_pnl != null ? balanceData.unrealized_pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '---'}
           </span>
        </div>
      </div>

      <div className="nav-links">
        <Link to="/" className={`nav-link ${isActive('/')}`}>Dashboard</Link>
        <Link to="/positions" className={`nav-link ${isActive('/positions')}`}>Positions</Link>
        <Link to="/signals" className={`nav-link ${isActive('/signals')}`}>Signals</Link>
        <Link to="/stats" className={`nav-link ${isActive('/stats')}`}>Stats</Link>
        <Link to="/journal" className={`nav-link ${isActive('/journal')}`}>Journal</Link>
        <Link to="/risk" className={`nav-link ${isActive('/risk')}`}>Risk</Link>
        <Link to="/webhook" className={`nav-link ${isActive('/webhook')}`}>Webhook</Link>
      </div>
    </nav>
  );
}

function App() {
  // Initialize websocket globally
  const { lastMessage } = useAppWebsocket();

  return (
    <Router>
      <ToastContainer position="bottom-right" />
      <Navigation lastMessage={lastMessage} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/risk" element={<Risk />} />
          <Route path="/webhook" element={<Webhook />} />
        </Routes>

        {/* Page Footer */}
        <footer style={{
          marginTop: 'auto',
          padding: '30px 20px',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          color: 'var(--text-muted)',
          fontSize: '0.85rem'
        }}>
          <img src="/alphahook-logo.svg" alt="AlphaHook" height="32" width="32" style={{ filter: 'drop-shadow(0 0 6px rgba(240,185,11,0.3))', marginBottom: '8px' }} />
          <div>AlphaHook © 2026</div>
        </footer>
      </main>
    </Router>
  );
}

export default App;
