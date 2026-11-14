"""SQLite persistence for market history and discovered symbols."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable

DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nexora.sqlite3"


class CandleRepository:
    def __init__(self, db_path: str | Path | None = None) -> None:
        configured = db_path or os.getenv("NEXORA_DB_PATH") or DEFAULT_DB_PATH
        self.db_path = Path(configured)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    def initialize(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS symbols (
                    symbol TEXT PRIMARY KEY,
                    base_asset TEXT NOT NULL,
                    quote_asset TEXT NOT NULL,
                    status TEXT NOT NULL,
                    spot_allowed INTEGER NOT NULL DEFAULT 1,
                    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS candles (
                    symbol TEXT NOT NULL,
                    interval TEXT NOT NULL,
                    open_time INTEGER NOT NULL,
                    open TEXT NOT NULL,
                    high TEXT NOT NULL,
                    low TEXT NOT NULL,
                    close TEXT NOT NULL,
                    volume TEXT NOT NULL,
                    close_time INTEGER NOT NULL,
                    quote_volume TEXT NOT NULL,
                    trade_count INTEGER NOT NULL,
                    taker_buy_base_volume TEXT NOT NULL,
                    taker_buy_quote_volume TEXT NOT NULL,
                    is_closed INTEGER NOT NULL DEFAULT 0,
                    stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (symbol, interval, open_time)
                );
                CREATE INDEX IF NOT EXISTS idx_candles_symbol_interval_time
                    ON candles(symbol, interval, open_time DESC);
                CREATE TABLE IF NOT EXISTS history_sync (
                    symbol TEXT NOT NULL,
                    interval TEXT NOT NULL,
                    oldest_open_time INTEGER,
                    newest_open_time INTEGER,
                    last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    rows_stored INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (symbol, interval)
                );
                """
            )

    def upsert_symbols(self, symbols: Iterable[dict[str, Any]]) -> int:
        rows = [
            (s["symbol"], s["base_asset"], s["quote_asset"], s["status"], int(s.get("spot_allowed", True)))
            for s in symbols
        ]
        if not rows:
            return 0
        with self._connect() as db:
            db.executemany(
                """INSERT INTO symbols(symbol,base_asset,quote_asset,status,spot_allowed)
                   VALUES(?,?,?,?,?)
                   ON CONFLICT(symbol) DO UPDATE SET
                     base_asset=excluded.base_asset, quote_asset=excluded.quote_asset,
                     status=excluded.status, spot_allowed=excluded.spot_allowed,
                     last_seen_at=CURRENT_TIMESTAMP""",
                rows,
            )
        return len(rows)

    def upsert_candles(self, symbol: str, interval: str, candles: Iterable[dict[str, Any]]) -> int:
        rows = [
            (
                symbol.upper(), interval, c["open_time"], c["open"], c["high"], c["low"],
                c["close"], c["volume"], c["close_time"], c["quote_volume"],
                c["trade_count"], c["taker_buy_base_volume"], c["taker_buy_quote_volume"],
                int(c.get("is_closed", False)),
            )
            for c in candles
        ]
        if not rows:
            return 0
        with self._connect() as db:
            db.executemany(
                """INSERT INTO candles(
                    symbol,interval,open_time,open,high,low,close,volume,close_time,
                    quote_volume,trade_count,taker_buy_base_volume,taker_buy_quote_volume,is_closed
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(symbol,interval,open_time) DO UPDATE SET
                    open=excluded.open, high=excluded.high, low=excluded.low,
                    close=excluded.close, volume=excluded.volume,
                    close_time=excluded.close_time, quote_volume=excluded.quote_volume,
                    trade_count=excluded.trade_count,
                    taker_buy_base_volume=excluded.taker_buy_base_volume,
                    taker_buy_quote_volume=excluded.taker_buy_quote_volume,
                    is_closed=excluded.is_closed, stored_at=CURRENT_TIMESTAMP""",
                rows,
            )
            db.execute(
                """INSERT INTO history_sync(symbol,interval,oldest_open_time,newest_open_time,rows_stored)
                   VALUES(?,?,?,?,?) ON CONFLICT(symbol,interval) DO UPDATE SET
                   oldest_open_time=MIN(COALESCE(history_sync.oldest_open_time, excluded.oldest_open_time), excluded.oldest_open_time),
                   newest_open_time=MAX(COALESCE(history_sync.newest_open_time, excluded.newest_open_time), excluded.newest_open_time),
                   last_synced_at=CURRENT_TIMESTAMP,
                   rows_stored=history_sync.rows_stored + excluded.rows_stored""",
                (symbol.upper(), interval, min(r[2] for r in rows), max(r[2] for r in rows), len(rows)),
            )
        return len(rows)

    def get_candles(self, symbol: str, interval: str, limit: int = 500, before: int | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM candles WHERE symbol=? AND interval=?"
        params: list[Any] = [symbol.upper(), interval]
        if before is not None:
            query += " AND open_time < ?"
            params.append(before)
        query += " ORDER BY open_time DESC LIMIT ?"
        params.append(limit)
        with self._connect() as db:
            rows = db.execute(query, params).fetchall()
        return [dict(row) for row in reversed(rows)]

    def get_history_status(self, symbol: str, interval: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute(
                "SELECT * FROM history_sync WHERE symbol=? AND interval=?",
                (symbol.upper(), interval),
            ).fetchone()
        return dict(row) if row else None

    def count_candles(self, symbol: str | None = None, interval: str | None = None) -> int:
        query = "SELECT COUNT(*) FROM candles WHERE 1=1"
        params: list[Any] = []
        if symbol:
            query += " AND symbol=?"
            params.append(symbol.upper())
        if interval:
            query += " AND interval=?"
            params.append(interval)
        with self._connect() as db:
            return int(db.execute(query, params).fetchone()[0])

    def list_symbols(self, quote_asset: str | None = None, limit: int = 1000) -> list[dict[str, Any]]:
        query = "SELECT * FROM symbols WHERE status='TRADING' AND spot_allowed=1"
        params: list[Any] = []
        if quote_asset:
            query += " AND quote_asset=?"
            params.append(quote_asset.upper())
        query += " ORDER BY symbol LIMIT ?"
        params.append(limit)
        with self._connect() as db:
            return [dict(row) for row in db.execute(query, params).fetchall()]
