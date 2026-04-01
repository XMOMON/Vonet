# Pro Paper Trader

A full-featured crypto paper trading system with real-time price tracking, automated TP/SL monitoring, and Telegram alerts.

---

## 🚀 Features

- **Signal Management**: Add trade signals with entry, TP1, TP2, SL, and reasoning
- **Real-Time Tracking**: Monitors Binance prices via CCXT; auto-opens positions when price hits entry
- **Partial Take-Profit**: 50% position closed at TP1, remainder trails to TP2
- **Stop-Loss Protection**: Automatic liquidation if price hits SL
- **Live Dashboard**: React UI with WebSocket updates; tracks unrealized PnL
- **Telegram Alerts**: Instant notifications for signal created, position opened, TP1/TP2/SL hits
- **Trade Journal**: Editable notes per closed trade
- **Performance Stats**: Win rate, average R:R, Sharpe ratio, max drawdown, equity curve
- **Per-Pair Analytics**: Breakdown by trading pair
- **Export**: Download trade history as CSV
- **Dockerized**: One-command deployment with Docker Compose

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

## 🔔 Telegram Alerts

If configured, you'll receive messages for:

- `📈 Signal Created`: Pair, direction, entry, TP, SL
- `🔔 Position Opened`: Entry price, size
- `💰 TP1 Hit`: Partial profit amount
- `🎯 TP2 Hit`: Full position closed (realized PnL)
- `⛔ SL Hit`: Loss amount
- `⚠️ Signal Expired`: Entry window missed

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
