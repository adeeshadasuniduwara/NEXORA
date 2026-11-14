"""Resilient Binance Spot combined-stream client for live market events."""
from __future__ import annotations

import asyncio
import json
import logging
import random
from collections.abc import Awaitable, Callable, Iterable
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

LOG = logging.getLogger(__name__)
WS_BASE = "wss://stream.binance.com:9443/stream?streams="

EventHandler = Callable[[dict[str, Any]], Awaitable[None]]
SUPPORTED_INTERVALS = {"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"}


def stream_names(symbols: Iterable[str], intervals: Iterable[str] = ("1m",)) -> list[str]:
    """Subscribe to all-market ticker snapshots plus detailed streams for selected symbols.

    The global !ticker@arr stream keeps every Binance Spot pair discoverable/live without
    opening thousands of per-symbol sockets. Detailed depth/trade/kline streams are limited
    to the actively selected symbol(s) to keep bandwidth and browser work bounded.
    """
    names: list[str] = ["!ticker@arr"]
    for symbol in symbols:
        normalized = symbol.strip().lower()
        if not normalized or not normalized.isalnum():
            raise ValueError(f"Invalid Binance symbol: {symbol!r}")
        for interval in intervals:
            if interval not in SUPPORTED_INTERVALS:
                raise ValueError(f"Unsupported kline interval: {interval}")
            names.append(f"{normalized}@kline_{interval}")
        names.extend((
            f"{normalized}@trade",
            f"{normalized}@bookTicker",
            f"{normalized}@depth20@100ms",
        ))
    return sorted(set(names))


class BinanceStreamClient:
    """Reconnectable consumer of Binance combined streams."""

    def __init__(
        self,
        streams: Iterable[str],
        on_event: EventHandler,
        *,
        base_url: str = WS_BASE,
        max_backoff: float = 30.0,
        ping_interval: float = 20.0,
    ) -> None:
        self.streams = sorted(set(streams))
        self.on_event = on_event
        self.base_url = base_url
        self.max_backoff = max_backoff
        self.ping_interval = ping_interval
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self.connected = False
        self.last_event_at: float | None = None
        self.reconnects = 0
        self.last_error: str | None = None

    @property
    def url(self) -> str:
        return self.base_url + "/".join(self.streams)

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self.run(), name="nexora-binance-stream")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self.connected = False

    async def run(self) -> None:
        delay = 1.0
        while not self._stop.is_set():
            try:
                async with websockets.connect(
                    self.url,
                    ping_interval=self.ping_interval,
                    ping_timeout=self.ping_interval,
                    close_timeout=5,
                    max_queue=256,
                ) as socket:
                    self.connected = True
                    self.last_error = None
                    delay = 1.0
                    LOG.info("Binance stream connected (%d streams)", len(self.streams))
                    async for raw in socket:
                        if self._stop.is_set():
                            break
                        try:
                            envelope = json.loads(raw)
                            stream = envelope.get("stream") if isinstance(envelope, dict) else None
                            payload = envelope.get("data", envelope) if isinstance(envelope, dict) else envelope
                            if isinstance(payload, list):
                                await self.on_event({"e": "tickerArray", "data": payload})
                            elif isinstance(payload, dict):
                                if stream and "@depth20@" in stream:
                                    payload["_stream"] = stream
                                await self.on_event(payload)
                            self.last_event_at = asyncio.get_running_loop().time()
                        except (json.JSONDecodeError, TypeError, ValueError) as exc:
                            self.last_error = f"invalid_event: {exc}"
                            LOG.warning("Ignoring malformed Binance event: %s", exc)
            except asyncio.CancelledError:
                raise
            except (OSError, ConnectionClosed, asyncio.TimeoutError) as exc:
                self.last_error = str(exc)
                LOG.warning("Binance stream disconnected: %s", exc)
            finally:
                self.connected = False
            if not self._stop.is_set():
                self.reconnects += 1
                await asyncio.sleep(min(delay, self.max_backoff) + random.uniform(0, 0.25))
                delay = min(delay * 2, self.max_backoff)

    def status(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "stream_count": len(self.streams),
            "reconnects": self.reconnects,
            "last_event_monotonic": self.last_event_at,
            "last_error": self.last_error,
        }
