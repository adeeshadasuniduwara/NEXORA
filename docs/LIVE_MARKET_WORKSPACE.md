# Live market workspace

## Pair discovery

The market symbol endpoint uses Binance Spot `exchangeInfo` and returns every symbol marked `TRADING` with Spot trading enabled. The browser builds its pair search list from that response on startup and refreshes the discovery list every five minutes, so newly listed Spot pairs are added automatically without a manual reload.

## Live data design

NEXORA uses one Binance combined WebSocket connection with:

- `!ticker@arr` for the all-market 24-hour ticker snapshots, covering the discovered Spot pairs.
- Selected pair `@trade` for immediate last-trade price and aggressor-side volume.
- Selected pair `@bookTicker` for best bid / ask and spread.
- Selected pair `@depth20@100ms` for the top 20 bid and ask levels at Binance's 100 ms update cadence.
- Selected pair `@kline_<interval>` for live candle updates.

The all-market ticker stream is intentionally global, while detailed trade and depth streams are limited to the currently selected pair. This avoids creating thousands of individual subscriptions and keeps bandwidth and browser rendering bounded.

## Fast-moving pairs

The scanner ranks pairs by observed price movement over a rolling 60-second window using the global ticker stream. Until enough local observations exist, it falls back to Binance's 24-hour percentage change. The local rolling window is session-only and resets when the browser reloads.

## Data and reliability limits

All feeds use public Binance Spot data; no API key or trading permission is required. Live data depends on Binance connectivity, rate limits, regional network conditions, and the availability of each market. The order book shown is the top 20 levels, not the full exchange order book. The feed client reconnects after connection failures, but automatic REST candle-gap recovery after a disconnect remains a separate reliability enhancement. The local UI currently expects one FastAPI process because the in-memory live-feed registry is process-local.
