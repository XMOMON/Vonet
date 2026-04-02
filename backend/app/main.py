import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import signals, positions, trades, stats, ws, export, webhooks, templates, risk
from app.services.price import price_polling_loop
from app.services.position import position_monitoring_loop
from app.services.telegram import command_bot_loop, daily_report_loop

app = FastAPI(title="AlphaHook")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(signals.router, prefix="/api/v1/signals", tags=["signals"])
app.include_router(positions.router, prefix="/api/v1/positions", tags=["positions"])
app.include_router(trades.router, prefix="/api/v1/trades", tags=["trades"])
app.include_router(stats.router, prefix="/api/v1/stats", tags=["stats"])
app.include_router(export.router, prefix="/api/v1/export", tags=["export"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["webhooks"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"])
app.include_router(risk.router, prefix="/api/v1/risk", tags=["risk"])

@app.on_event("startup")
async def startup_event():
    # Initialize DB (usually done via alembic for production, but good for local dev)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # Start background tasks
    asyncio.create_task(price_polling_loop())
    asyncio.create_task(position_monitoring_loop())
    asyncio.create_task(command_bot_loop())
    asyncio.create_task(daily_report_loop())

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pro Paper Trader API is running"}
