"""Binance Spot public market-data adapter (no API key required)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

BASE_URL = "https://data-api.binance.vision"
SUPPORTED_INTERVALS = {
    "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h",
    "12h", "1d", "3d", "1w", "1M",
}
MAX_PAGE_SIZE = 1000


class BinanceMarketDataError(RuntimeError):
    pass


def _to_milliseconds(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


class BinanceSpotClient:
    def __init__(self, base_url: str = BASE_URL, timeout: float = 15.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def _get(self, path: str, params: dict[str, Any]) -> Any:
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
                response = await client.get(path, params=params)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise BinanceMarketDataError(f"Binance market-data request failed: {exc}") from exc

    async def exchange_info(self) -> dict[str, Any]:
        return await self._get("/api/v3/exchangeInfo", {})

    async def candles(
        self,
        symbol: str,
        interval: str,
        limit: int = 500,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> list[dict[str, Any]]:
        if interval not in SUPPORTED_INTERVALS:
            raise ValueError(f"Unsupported Binance candle interval: {interval}")
        if not 1 <= limit <= MAX_PAGE_SIZE:
            raise ValueError(f"limit must be between 1 and {MAX_PAGE_SIZE}")

        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": limit,
        }
        if start_time is not None:
            params["startTime"] = _to_milliseconds(start_time)
        if end_time is not None:
            params["endTime"] = _to_milliseconds(end_time)

        raw = await self._get("/api/v3/klines", params)
        return [self._normalize_candle(row) for row in raw]

    async def candle_history(
        self,
        symbol: str,
        interval: str,
        start_time: datetime,
        end_time: datetime | None = None,
        max_candles: int = 5000,
    ) -> list[dict[str, Any]]:
        """Fetch older-to-newer candles using bounded 1000-candle REST pages."""
        if max_candles < 1:
            raise ValueError("max_candles must be positive")
        if interval not in SUPPORTED_INTERVALS:
            raise ValueError(f"Unsupported Binance candle interval: {interval}")

        end_ms = _to_milliseconds(end_time) if end_time else None
        cursor_ms = _to_milliseconds(start_time)
        output: list[dict[str, Any]] = []

        while len(output) < max_candles:
            page = await self._get(
                "/api/v3/klines",
                {
                    "symbol": symbol.upper(),
                    "interval": interval,
                    "startTime": cursor_ms,
                    "limit": min(MAX_PAGE_SIZE, max_candles - len(output)),
                    **({"endTime": end_ms} if end_ms is not None else {}),
                },
            )
            if not page:
                break

            normalized = [self._normalize_candle(row) for row in page]
            output.extend(normalized)
            next_cursor = int(page[-1][0]) + 1
            if next_cursor <= cursor_ms or len(page) < 1:
                break
            cursor_ms = next_cursor
            if end_ms is not None and cursor_ms > end_ms:
                break

        # Defensive de-duplication by candle open time.
        unique = {candle["open_time"]: candle for candle in output}
        return [unique[key] for key in sorted(unique)]

    @staticmethod
    def _normalize_candle(row: list[Any]) -> dict[str, Any]:
        return {
            "open_time": int(row[0]),
            "open": str(row[1]),
            "high": str(row[2]),
            "low": str(row[3]),
            "close": str(row[4]),
            "volume": str(row[5]),
            "close_time": int(row[6]),
            "quote_volume": str(row[7]),
            "trade_count": int(row[8]),
            "taker_buy_base_volume": str(row[9]),
            "taker_buy_quote_volume": str(row[10]),
        }
