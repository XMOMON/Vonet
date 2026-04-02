# AlphaHook

A full-featured crypto paper trading system with real-time price tracking, automated TP/SL monitoring, and Telegram alerts.

---

## 🚀 Features

- **Signal Management**: Add trade signals with entry, TP1, TP2, SL, and reasoning; optional expiry date
- **Real-Time Tracking**: Monitors Binance prices via CCXT; auto-opens positions when price hits entry (±0.5% tolerance)
- **Partial Take-Profit**: 50% position closes at TP1, remainder trails to TP2 with SL moved to breakeven
- **Stop-Loss Protection**: Automatic liquidation if price hits SL; manual close button for emergency exits
- **Live Dashboard**: React UI with WebSocket updates; tracks unrealized PnL, equity curve, portfolio heatmap
- **Telegram Bot**: Two-way — send `/status`, `/balance`, `/positions`, `/daily` for instant updates; alerts for signal created, entry triggered, TP1/TP2/SL hits, signal expiry, manual close
- **Trade Journal**: Inline-editable notes per closed trade + daily PnL heatmap calendar (`/journal` page) with daily PnL calendar heatmap
- **Performance Stats**: Win rate, average R:R, Sharpe, max drawdown, equity curve, per-pair breakdown, daily PnL calendar
- **Export**: Download trade history as CSV
- **Webhook API**: `/api/v1/webhooks/tradingview` endpoint for automated TradingView alerts (secret-protected)
- **Dockerized**: One-command deployment with Docker Compose

## ✨ Recent Enhancements (April 2026)

- **Dashboard Revamp**: Live KPI cards (PnL, Win Rate, Max Drawdown, Trade Count) + interactive equity curve (Recharts) + portfolio heatmap
- **Trade Journal with Calendar**: Inline-editable notes per closed trade + daily PnL heatmap calendar (`/journal` page)
- **Per-Pair Analytics**: Stats breakdown by trading pair (win rate, avg PnL, total PnL) in `/stats`
- **Signal Expiry**: Auto-cancellation of stale signals (`expires_at`) with Telegram alerts
- **True Partial TP**: 50% position closes at TP1, remainder trails to TP2 with SL moved to breakeven
- **Telegram Bot**:
  - Alerts: signal created, entry triggered, TP1/TP2/SD hit, signal expired, manual close
  - Commands: `/status`, `/balance`, `/positions`, `/daily` (today's trades summary)
- **Manual Close Button**: Red ✕ button on Positions page to force-close a trade; creates Trade record and fires Telegram alert
- **Webhook API**: POST `/api/v1/webhooks/tradingview` for automated TradingView alerts (secret auth, price validation, duplicate protection)
- **R:R Calculator**: Auto-calculated risk:reward shown in Signals list
- **Timezone Fix**: Migrated to timezone-aware datetime handling

## 📸 Screenshots

![Dashboard](./docs/assets/dashboard_view_1775081435597.png)
![Stats Page](./docs/assets/stats_page_scrolled_1775081478677.png)
![Trade Journal](./docs/assets/journal_page_1775081487913.png)
![New Signal Modal](./docs/assets/new_signal_modal_1775081462028.png)


---

## 🛠 Tech Stack

**Backend**: FastAPI, SQLAlchemy (async), PostgreSQL, CCXT, Uvicorn  
**Frontend**: React 18, TypeScript, Tailwind CSS, Recharts, Axios  
**Infra**: Docker, Docker Compose

---

## 📦 Project Structure

```
paper-trader/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + startup/shutdown events
│   │   ├── config.py         # Settings from .env
│   │   ├── database.py       # Async SQLAlchemy engine
│   │   ├── models/           # Signal, Position, Trade, Balance
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── routers/          # API endpoints (signals, positions, trades, stats)
│   │   ├── services/         # Price polling, position monitor, PnL calc, Telegram
│   │   └── utils/            # Helpers (validation, metrics)
│   ├── requirements.txt
│   └── Dockerfile.backend
├── frontend/
│   ├── src/
│   │   ├── components/       # Dashboard, Positions, Signals, Stats, Journal
│   │   ├── services/         # API client + WebSocket
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile.frontend
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```env
# Database
DATABASE_URL=postgresql+asyncpg://trader:trader_password@db:5432/paper_trader

# Exchange
EXCHANGE=binance
API_KEY=your_binance_testnet_key
API_SECRET=your_binance_testnet_secret

# Risk
RISK_PER_TRADE=0.02      # 2% of balance per trade
MAX_POSITIONS=5
PARTIAL_TP=true
PARTIAL_TP_PCT=0.5       # Close 50% at TP1, remainder to TP2

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## 🐳 Quick Start (Docker)

```bash
# 1. Clone and cd
git clone https://github.com/yourusername/paper-trader.git
cd paper-trader

# 2. Create .env (see above)

# 3. Bring up services
docker-compose up -d --build

# 4. Access:
#    Frontend Dashboard: http://localhost:5173
#    Backend API Docs (Swagger): http://localhost:8000/docs
#    Backend Root: http://localhost:8000
```

Frontend port is 5173; backend runs on 8000.

---

## 🧪 Testing

1. **Add a signal** via the Signals page:
   - Pair: `BTC/USDT` (or any Binance symbol)
   - Direction: LONG or SHORT
   - Entry: near current market price (check Binance)
   - TP1, TP2, SL
   - Reason (optional)

2. **Watch Positions page**:
   - Once price hits entry tolerance (±0.5%), position status becomes OPEN
   - Unrealized PnL updates in real-time
   - At TP1 → 50% closes, alert sent
   - At TP2 → remainder closes
   - At SL → full close

3. **Review trades** in Journal and Stats pages.

---

## 📊 Metrics Explained

- **Win Rate**: % of trades with positive PnL
- **Avg R:R**: Average risk-to-reward ratio ( TP distance / SL distance )
- **Sharpe Ratio**: Risk-adjusted return (higher better)
- **Max Drawdown**: Largest peak-to-trough decline in equity
- **Equity Curve**: Total balance + unrealized over time

---

## 🔔 Telegram Alerts & Bot

If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, you'll receive notifications for:

- `📡 Signal Created`: Pair, direction, entry, TP, SL, R:R
- `🔔 Entry Triggered`: Position opened with entry price and size
- `💰 TP1 Hit`: Partial profit amount (50% closed)
- `🎯 TP2 Hit`: Full position closed (total realized PnL)
- `⛔ SL Hit`: Loss amount
- `⚠️ Signal Expired`: Entry window missed
- `✕ Manually Closed`: When you force-close from the UI

### Interactive Commands

Send these commands to your bot in Telegram for instant status:

- `/status` — Overall stats (total PnL, win rate, open positions count)
- `/balance` — Current paper balance + unrealized PnL
- `/positions` — List of open positions with current PnL
- `/signals` — Recent signals (pending/executed)
- `/daily` — Today's trades summary (PnL, trade count)

The bot responds within seconds.

## 📡 Webhook Integration (TradingView)

Your backend exposes `POST /webhooks/tradingview` to receive TradingView alerts.

**Setup:**

1. Set `WEBHOOK_SECRET` in `.env` (keep it random).
2. In TradingView alert message, send JSON:

```json
{
  "secret": "YOUR_WEBHOOK_SECRET",
  "pair": "BTC/USDT",
  "direction": "LONG",
  "entry": 67500.0,
  "tp1": 68500.0,
  "tp2": 69500.0,
  "sl": 66800.0,
  "reason": "EMA crossover + RSI oversold"
}
```

3. Webhook URL: `https://your-backend.onrender.com/webhooks/tradingview` (or `http://localhost:8000/webhooks/tradingview` locally)

The endpoint validates the secret, checks for duplicates, enforces max positions, and creates a PENDING signal in your database — same as manual entry. Telegram alert is sent automatically.

---

### **Limitations / Manual Steps**

- **Signal entry tolerance** is fixed at 0.5% of entry price
- **Position sizing** is fixed % of current balance (configurable via `RISK_PER_TRADE`)
- **Paper trading only** — no real orders placed (safe)
- **Testnet recommended** if you connect real Binance API keys

---

## 🚧 Limitations / Manual Steps

- **Signal entry tolerance** is fixed at 0.5% of entry price
- **Position sizing** is fixed % of current balance (configurable)
- **Paper trading only** — no real orders placed (safe)
- **Testnet recommended** if you connect real Binance API keys

---

## 📜 License

MIT — feel free to fork, modify, and use.

---

## 🙋 Support

Open an issue on GitHub or contact maintainer.

---

**Built with ❤️ for systematic traders.**
