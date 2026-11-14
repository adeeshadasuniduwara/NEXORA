import pytest

from app.market.streams import BinanceStreamClient, stream_names


def test_stream_names_include_kline_trade_and_book_ticker():
    names = stream_names(["BTCUSDT"], ["1m", "5m"])
    assert "btcusdt@kline_1m" in names
    assert "btcusdt@kline_5m" in names
    assert "btcusdt@trade" in names
    assert "btcusdt@bookTicker" in names


def test_stream_names_reject_invalid_symbol_or_interval():
    with pytest.raises(ValueError):
        stream_names(["BTC/USDT"])
    with pytest.raises(ValueError):
        stream_names(["BTCUSDT"], ["7m"])


def test_client_status_starts_disconnected():
    async def noop(event):
        return None

    client = BinanceStreamClient(["btcusdt@trade"], noop)
    status = client.status()
    assert status["connected"] is False
    assert status["stream_count"] == 1
    assert status["reconnects"] == 0
