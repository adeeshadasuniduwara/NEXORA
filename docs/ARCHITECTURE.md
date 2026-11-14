# NEXORA architecture notes

## Product direction

NEXORA is a browser-based, chart-first crypto market analysis platform. Binance is the direct market-data source. The chart must not embed TradingView or consume TradingView market feeds.

## Candle data lifecycle

1. Discover active Spot symbols through Binance `exchangeInfo`.
2. Load historical OHLCV candles through the public Spot REST `/api/v3/klines` endpoint, paging with a maximum of 1000 records per request.
3. Normalize and de-duplicate by `(symbol, interval, open_time)`.
4. Persist candles in a database in the persistence phase; do not repeatedly download already stored ranges.
5. Subscribe to the matching WebSocket kline stream for live candle updates.
6. On disconnect, reconnect with backoff and backfill the time gap through REST before resuming normal live processing.

History availability depends on the symbol's listing/trading history and Binance's data availability. Long-term retention is a NEXORA storage responsibility after ingestion; it cannot manufacture candles that Binance never provided.

## Reliability requirements

- Respect Binance request weights and WebSocket connection/subscription limits.
- Use bounded queues, heartbeat handling, reconnect/backoff, and observable feed health.
- Treat the currently forming candle as mutable until Binance marks it closed.
- Use decimal strings at the API boundary to avoid losing exchange precision.
- Do not subscribe every browser independently to every symbol. The backend should multiplex feeds and distribute only needed updates.

## Planned phases

1. Foundation and public market-data adapter.
2. Symbol discovery, historical candle persistence, and backfill scheduler.
3. Live WebSocket manager and feed recovery.
4. Independent chart renderer and chart interactions.
5. Order book, trades, and order-flow metrics.
6. Optional strategy modules and chart signals.
7. Backtesting, strategy memory, and performance reports.
8. User setup, encrypted credentials, Telegram integration, security hardening.
9. CI checks and public deployment.

## API key policy

Binance public market data does not require a Binance API key. NEXORA must not ask users for trading-enabled Binance credentials just to view charts. OpenAI and Telegram setup are separate product features and must never block public candle viewing unless the product owner explicitly changes that requirement.
