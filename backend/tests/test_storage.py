from app.storage.database import CandleRepository


def candle(open_time: int, close: str = "10.5"):
    return {
        "open_time": open_time, "open": "10", "high": "11", "low": "9",
        "close": close, "volume": "100", "close_time": open_time + 59999,
        "quote_volume": "1000", "trade_count": 12,
        "taker_buy_base_volume": "40", "taker_buy_quote_volume": "400",
        "is_closed": True,
    }


def test_upsert_is_idempotent_and_updates_existing_candle(tmp_path):
    repo = CandleRepository(tmp_path / "test.sqlite3")
    repo.upsert_candles("BTCUSDT", "1m", [candle(1000)])
    repo.upsert_candles("BTCUSDT", "1m", [candle(1000, "10.8"), candle(61000)])

    assert repo.count_candles("BTCUSDT", "1m") == 2
    rows = repo.get_candles("BTCUSDT", "1m")
    assert rows[0]["close"] == "10.8"
    assert rows[1]["open_time"] == 61000


def test_symbol_discovery_upsert_and_quote_filter(tmp_path):
    repo = CandleRepository(tmp_path / "test.sqlite3")
    repo.upsert_symbols([
        {"symbol": "BTCUSDT", "base_asset": "BTC", "quote_asset": "USDT", "status": "TRADING"},
        {"symbol": "ETHBTC", "base_asset": "ETH", "quote_asset": "BTC", "status": "TRADING"},
    ])
    assert len(repo.list_symbols(quote_asset="USDT")) == 1
    assert repo.list_symbols(quote_asset="USDT")[0]["symbol"] == "BTCUSDT"


def test_empty_candle_batch_is_safe(tmp_path):
    repo = CandleRepository(tmp_path / "test.sqlite3")
    assert repo.upsert_candles("BTCUSDT", "1m", []) == 0
    assert repo.count_candles() == 0
