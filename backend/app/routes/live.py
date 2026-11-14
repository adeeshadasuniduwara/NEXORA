"""Live Binance feed control and browser WebSocket endpoint."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.market.live import live_feed
from app.market.streams import stream_names

router = APIRouter(prefix="/live", tags=["live market data"])


@router.post("/start")
async def start_live_feed(
    symbols: list[str] = Query(..., min_length=1, max_length=20),
    intervals: list[str] = Query(default=["1m"], max_length=5),
):
    try:
        names = stream_names(symbols, intervals)
        await live_feed.start(symbols, intervals)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"started": True, "streams": names, "status": live_feed.status()}


@router.post("/stop")
async def stop_live_feed():
    await live_feed.stop()
    return {"stopped": True, "status": live_feed.status()}


@router.get("/status")
async def live_status():
    return live_feed.status()


@router.websocket("/ws")
async def live_events(websocket: WebSocket):
    await websocket.accept()
    queue = await live_feed.subscribe()
    try:
        await websocket.send_json({"type": "connected", "status": live_feed.status()})
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat", "status": live_feed.status()})
    except WebSocketDisconnect:
        pass
    finally:
        await live_feed.unsubscribe(queue)
