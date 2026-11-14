"""Historical candle ingestion orchestration."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.market.binance import BinanceSpotClient
from app.storage.database import CandleRepository


class CandleHistoryService:
    def __init__(self, client: BinanceSpotClient, repository: CandleRepository) -> None:
        self.client = client
        self.repository = repository

    async def backfill(
        self,
        symbol: str,
        interval: str,
        start_time: datetime,
        end_time: datetime | None = None,
        max_candles: int = 5000,
    ) -> dict[str, Any]:
        candles = await self.client.candle_history(
            symbol=symbol,
            interval=interval,
            start_time=start_time,
            end_time=end_time,
            max_candles=max_candles,
        )
        stored = self.repository.upsert_candles(symbol, interval, candles)
        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "fetched": len(candles),
            "stored_or_updated": stored,
            "history": self.repository.get_history_status(symbol, interval),
        }
