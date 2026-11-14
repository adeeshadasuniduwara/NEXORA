from app.market.binance import BinanceSpotClient, SUPPORTED_INTERVALS


def test_supported_intervals_include_common_chart_timeframes():
    assert {"1m", "5m", "15m", "1h", "4h", "1d"}.issubset(SUPPORTED_INTERVALS)


def test_normalize_candle_preserves_decimal_precision_as_strings():
    row = [1700000000000, "1.230000", "1.250000", "1.200000", "1.240000", "10.500", 1700000059999, "13.020", 42, "4.200", "5.208", "0"]
    candle = BinanceSpotClient._normalize_candle(row)
    assert candle["open"] == "1.230000"
    assert candle["close"] == "1.240000"
    assert candle["trade_count"] == 42
