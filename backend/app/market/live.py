"""Application-level live feed registry and event fan-out."""
from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from typing import Any

from app.market.streams import BinanceStreamClient, stream_names


class LiveFeed:
    def __init__(self, max_events: int = 500) -> None:
        self.max_events = max_events
        self.events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self.subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self.client: BinanceStreamClient | None = None
        self._lock = asyncio.Lock()

    async def publish(self, event: dict[str, Any]) -> None:
        self.events.append(event)
        stale: list[asyncio.Queue[dict[str, Any]]] = []
        for queue in tuple(self.subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                stale.append(queue)
        for queue in stale:
            self.subscribers.discard(queue)

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self.subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self.subscribers.discard(queue)

    async def start(self, symbols: list[str], intervals: list[str]) -> None:
        async with self._lock:
            if self.client:
                await self.client.stop()
            streams = stream_names(symbols, intervals)
            self.client = BinanceStreamClient(streams, self.publish)
            await self.client.start()

    async def stop(self) -> None:
        async with self._lock:
            if self.client:
                await self.client.stop()
                self.client = None

    def status(self) -> dict[str, Any]:
        return self.client.status() if self.client else {
            "connected": False, "stream_count": 0, "reconnects": 0,
            "last_event_monotonic": None, "last_error": None,
        }


live_feed = LiveFeed()
