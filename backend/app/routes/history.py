from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.market.binance import BinanceMarketDataError, BinanceSpotClient, SUPPORTED_INTERVALS
from app.market.history import CandleHistoryService
from app.storage.database import CandleRepository

router = APIRouter(prefix="/history", tags=["historical data"])
repository = CandleRepository()
client = BinanceSpotClient()
service = CandleHistoryService(client, repository)


@router.post("/symbols/sync")
async def sync_symbols():
    try:
        payload = await client.exchange_info()
    except BinanceMarketDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    active = [
        {
            "symbol": item["symbol"],
            "base_asset": item["baseAsset"],
            "quote_asset": item["quoteAsset"],
            "status": item["status"],
            "spot_allowed": item.get("isSpotTradingAllowed", True),
        }
        for item in payload.get("symbols", [])
        if item.get("status") == "TRADING" and item.get("isSpotTradingAllowed", True)
    ]
    count = repository.upsert_symbols(active)
    return {"discovered": count, "active_spot_symbols": len(active)}


@router.get("/symbols")
async def stored_symbols(quote_asset: str | None = None, limit: int = Query(default=1000, ge=1, le=5000)):
    return {"count": len(repository.list_symbols(quote_asset, limit)), "symbols": repository.list_symbols(quote_asset, limit)}


@router.post("/candles/backfill")
async def backfill_candles(
    symbol: str = Query(min_length=5, max_length=30, pattern=r"^[A-Za-z0-9]+$"),
    interval: str = Query(default="1h"),
    start_time: datetime = Query(),
    end_time: datetime | None = None,
    max_candles: int = Query(default=5000, ge=1, le=50000),
):
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(status_code=422, detail="Unsupported Binance interval")
    if end_time and start_time >= end_time:
        raise HTTPException(status_code=422, detail="start_time must be before end_time")
    try:
        return await service.backfill(symbol, interval, start_time, end_time, max_candles)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BinanceMarketDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/candles")
async def stored_candles(
    symbol: str = Query(min_length=5, max_length=30, pattern=r"^[A-Za-z0-9]+$"),
    interval: str = Query(default="1h"),
    limit: int = Query(default=500, ge=1, le=5000),
    before: int | None = Query(default=None, ge=0),
):
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(status_code=422, detail="Unsupported Binance interval")
    rows = repository.get_candles(symbol, interval, limit, before)
    return {"symbol": symbol.upper(), "interval": interval, "count": len(rows), "candles": rows}


@router.get("/status")
async def history_status(symbol: str = Query(min_length=5, max_length=30), interval: str = "1h"):
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(status_code=422, detail="Unsupported Binance interval")
    return {"symbol": symbol.upper(), "interval": interval, "history": repository.get_history_status(symbol, interval), "stored_candles": repository.count_candles(symbol, interval)}
