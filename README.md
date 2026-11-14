# NEXORA

A chart-first crypto market analysis platform powered by Binance public market data.

## Current status

Phase 01 foundation is being built. The initial backend provides a small FastAPI service and a Binance Spot market-data adapter. Trading, order placement, and withdrawals are intentionally out of scope for the initial paper/analysis release.

## Architecture

- `backend/` — Python FastAPI API and market-data adapters.
- `frontend/` — browser client (React + TypeScript, planned).
- `docs/` — architecture and implementation notes.

## Binance candle data

NEXORA uses Binance public market-data endpoints directly. Historical candles are retrieved from the Spot REST klines endpoint in pages; live candle updates will use Binance WebSocket kline streams in a later phase. Candle history is limited by the symbol's actual listing/trading history and Binance availability; it is not unlimited for every symbol.

## Run backend locally

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the API documentation.

## Safety

- Public market data only in the foundation phase.
- No exchange trading permissions or withdrawal features.
- Never commit API keys, Telegram bot tokens, or `.env` files.
- OpenAI integration will be optional to market-data processing and called only for selected higher-level reasoning tasks; API usage may incur provider charges.
