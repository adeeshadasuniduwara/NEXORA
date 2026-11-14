# NEXORA

A chart-first crypto market analysis workspace powered by Binance public market data.

## Current capabilities

- Binance Spot symbol discovery and historical candle retrieval.
- SQLite-backed historical candle storage and bounded backfill.
- Binance Spot WebSocket streams for candles, trades, and book ticker events.
- Local animated browser workspace with a project-owned candlestick renderer.
- Windows one-click launcher with environment setup, dependency repair, and Git-based updates.

## Architecture

- `backend/` — FastAPI API, Binance REST/WebSocket adapters, and browser UI assets.
- `docs/` — architecture and operational notes.
- `START_NEXORA.bat` — Windows launcher.

## Windows quick start

1. Install Python 3.10+ and Git for Windows.
2. Clone or download this repository.
3. Double-click `START_NEXORA.bat`.
4. The launcher prepares the isolated environment and opens the local workspace at `http://127.0.0.1:8000`.

For a Git clone with a clean working tree, each launch checks `origin/main` and fast-forward updates before startup. If local changes are present, updating is skipped to protect them. ZIP downloads do not contain Git history and cannot self-update through Git.

See [Windows launcher guide](docs/WINDOWS_LAUNCHER.md).

## Data limits

Historical candle availability depends on each symbol's listing history and Binance availability. NEXORA does not promise unlimited historical data. WebSocket reconnect is supported; automatic REST gap backfill after a disconnect remains a follow-up reliability task.

## Safety

- Public market data only; no live order placement or withdrawals.
- No exchange trading credentials are required.
- Never commit API keys, Telegram bot tokens, or `.env` files.
- OpenAI integration, if enabled in a later release, may incur provider charges.
