# Binance live market data

Phase 03 adds a backend-owned Binance Spot combined-stream consumer.

## Supported streams

For each selected symbol, NEXORA subscribes to kline streams for requested intervals, plus aggregate trade and book ticker streams. The current subscription endpoint caps a request at 20 symbols and 5 intervals to keep initial use bounded.

## API

- `POST /api/v1/live/start?symbols=BTCUSDT&symbols=ETHUSDT&intervals=1m&intervals=5m`
- `POST /api/v1/live/stop`
- `GET /api/v1/live/status`
- `WS /api/v1/live/ws` — receives Binance event payloads and periodic heartbeat status.

The backend multiplexes one selected feed to connected browser clients; browsers do not independently open Binance connections.

## Reliability

The consumer enables protocol ping/pong, bounded receive queues, malformed-event isolation, exponential reconnect backoff with jitter, and connection status reporting. A later recovery phase must compare the last persisted candle with REST history and backfill gaps after reconnect; this module exposes reconnect state but does not yet automatically backfill gaps.

## Safety and scope

Only public Binance Spot market data is consumed. No API keys, order placement, trading, or withdrawals are used. This is a single-process development feed registry; multi-worker deployment needs shared pub/sub and coordinated subscription ownership.
