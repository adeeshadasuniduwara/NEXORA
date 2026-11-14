from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.market.binance import BinanceMarketDataError, BinanceSpotClient, SUPPORTED_INTERVALS

router = APIRouter(prefix="/market", tags=["market data"])
client = BinanceSpotClient()


@router.get("/symbols")
async def symbols():
    try:
        payload = await client.exchange_info()
    except BinanceMarketDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "symbols": [
            {
                "symbol": item["symbol"],
                "base_asset": item["baseAsset"],
                "quote_asset": item["quoteAsset"],
                "status": item["status"],
            }
            for item in payload.get("symbols", [])
            if item.get("status") == "TRADING" and item.get("isSpotTradingAllowed", True)
        ]
    }


@router.get("/candles")
async def candles(
    symbol: str = Query(min_length=5, max_length=30, pattern=r"^[A-Za-z0-9]+$"),
    interval: str = Query(default="1h"),
    limit: int = Query(default=500, ge=1, le=1000),
    start_time: datetime | None = None,
    end_time: datetime | None = None,
):
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(status_code=422, detail="Unsupported Binance interval")
    if start_time and end_time and start_time >= end_time:
        raise HTTPException(status_code=422, detail="start_time must be before end_time")
    try:
        result = await client.candles(symbol, interval, limit, start_time, end_time)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BinanceMarketDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"symbol": symbol.upper(), "interval": interval, "count": len(result), "candles": result}
