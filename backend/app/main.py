from fastapi import FastAPI

from app.routes.market import router as market_router

app = FastAPI(
    title="NEXORA API",
    version="0.1.0",
    description="Chart-first crypto market analysis API using public Binance market data.",
)

app.include_router(market_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "nexora-api"}
