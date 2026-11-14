from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.routes.history import router as history_router
from app.routes.live import router as live_router
from app.routes.market import router as market_router

app = FastAPI(
    title="NEXORA",
    version="0.5.0",
    description="Live Binance Spot market terminal with all-market ticker discovery, selected-pair depth, and chart analysis.",
)

app.include_router(market_router, prefix="/api/v1")
app.include_router(history_router, prefix="/api/v1")
app.include_router(live_router, prefix="/api/v1")

static_dir = Path(__file__).parent / "static"
app.mount("/assets", StaticFiles(directory=static_dir), name="assets")


@app.get("/", include_in_schema=False)
async def home():
    return RedirectResponse(url="/assets/index.html")


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "nexora"}
