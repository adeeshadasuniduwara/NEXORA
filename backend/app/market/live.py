"""Application-level live feed registry and event fan-out."""
from __future__ import annotations

import asyncio
from collections import deque
from typing import Any

from app.market.streams import BinanceStreamClient, stream_names


class LiveFeed:
    """Fan out live events without permanently disconnecting slow subscribers.

    Market depth can arrive several times per second. If a browser briefly falls
    behind, retaining the oldest queued events makes its book visibly stale.
    Drop the oldest queued event instead and always deliver the newest snapshot.
    """

    def __init__(self, max_events: int = 500, subscriber_queue_size: int = 250) -> None:
        self.max_events = max_events
        self.subscriber_queue_size = max(1, subscriber_queue_size)
        self.events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self.subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self.client: BinanceStreamClient | None = None
        self._lock = asyncio.Lock()
        self.dropped_events = 0

    async def publish(self, event: dict[str, Any]) -> None:
        self.events.append(event)
        for queue in tuple(self.subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Keep the stream alive and favor the freshest market state.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(event)
                    self.dropped_events += 1
                except asyncio.QueueFull:
                    # Defensive only: the queue is not shared across threads.
                    self.dropped_events += 1

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=self.subscriber_queue_size)
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
        status = self.client.status() if self.client else {
            "connected": False, "stream_count": 0, "reconnects": 0,
            "last_event_monotonic": None, "last_error": None,
        }
        status.update({
            "subscriber_count": len(self.subscribers),
            "dropped_events": self.dropped_events,
            "subscriber_queue_size": self.subscriber_queue_size,
        })
        return status


live_feed = LiveFeed()
