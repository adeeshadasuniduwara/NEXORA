# NEXORA

A chart-first crypto market analysis workspace powered by Binance public market data.

## Current capabilities

- Binance Spot symbol discovery and historical candle retrieval.
- SQLite-backed historical candle storage and bounded backfill.
- Binance Spot WebSocket streams for candles, trades, book ticker events and all-market tickers.
- Local animated browser workspace with a project-owned candlestick renderer, pair search, live movers and selected-pair order book.
- Windows launcher with environment setup and dependency repair.
- Central GitHub Releases updater: running clients check for releases, verify the update archive SHA-256, install the update, restart, and show the release notes and installation time.

## Architecture

- `backend/` — FastAPI API, Binance REST/WebSocket adapters, updater and browser UI assets.
- `docs/` — architecture and operational notes.
- `START_NEXORA.bat` — Windows launcher.
- `VERSION` and `backend/app/version.py` — current release version (keep these in sync).

## Windows quick start

1. Install Python 3.10+ and Git for Windows (Git is required for Git-clone installations).
2. Clone or download this repository.
3. Double-click `START_NEXORA.bat`.
4. The launcher prepares the isolated environment and opens the local workspace at `http://127.0.0.1:8000`.

## How automatic updates work

1. A change is merged or pushed to `main`.
2. GitHub Actions runs the backend test suite.
3. Only after tests pass, the release job packages the app and publishes a versioned GitHub Release with a SHA-256 checksum.
4. Running NEXORA clients check the latest release every 30 seconds.
5. When a newer version is found, the client downloads and verifies the package, installs it in a detached helper, and restarts the local server.
6. After restart, a notification displays the version, release notes, and local installation time.

Every public update must bump the semantic version in both `VERSION` and `backend/app/version.py`. The workflow intentionally fails if that version tag already exists. Git clones update with a fast-forward pull and preserve local modifications; ZIP installations apply only allowlisted application files. Local database/data folders are not included in the update archive.

If a Git clone has uncommitted changes, automatic installation is blocked to protect those changes. If GitHub or the internet is unavailable, NEXORA continues running on the installed version and retries on the next check. Updates restart the local server, so the browser briefly reconnects.

See [Windows launcher guide](docs/WINDOWS_LAUNCHER.md) and [automatic updater guide](docs/AUTO_UPDATER.md).

## Data limits

Historical candle availability depends on each symbol's listing history and Binance availability. NEXORA does not promise unlimited historical data. WebSocket reconnect is supported; automatic REST gap backfill after a disconnect remains a follow-up reliability task.

## Safety

- Public market data only; no live order placement or withdrawals.
- No exchange trading credentials are required.
- Never commit API keys, Telegram bot tokens, or `.env` files.
- OpenAI integration, if enabled in a later release, may incur provider charges.
