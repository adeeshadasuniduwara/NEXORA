# Historical candle storage

## Storage

SQLite is the development/default persistence backend. Set `NEXORA_DB_PATH` to choose a different local database path. Candle identity is `(symbol, interval, open_time)`, enforced by a primary key. Upserts make repeated backfill requests safe and allow the currently forming candle to be corrected by later updates.

## Endpoints

- `POST /api/v1/history/symbols/sync` — refresh active Binance Spot symbol metadata.
- `GET /api/v1/history/symbols` — read locally stored symbols; optional `quote_asset` filter.
- `POST /api/v1/history/candles/backfill` — fetch a bounded historical range and persist it. `start_time` is required; `max_candles` is capped at 50,000 per request.
- `GET /api/v1/history/candles` — read stored candles in chronological order; `before` supports backward pagination using an open-time cursor.
- `GET /api/v1/history/status` — inspect stored row count and oldest/newest sync timestamps.

## Important behavior

- This phase does not yet schedule automatic background backfills or live WebSocket ingestion.
- A user/operator triggers the symbol refresh and historical backfill endpoints. The next phase will add live feed management and recovery/backfill coordination.
- Binance history cannot predate a pair's actual listing/trading history. A per-request cap protects the service from accidental huge downloads; callers can request older ranges in multiple bounded batches.
- SQLite is suitable for local development and a single-process starter deployment. A multi-instance public deployment should move to PostgreSQL and shared coordination before scaling.
