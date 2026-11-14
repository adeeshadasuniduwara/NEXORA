# NEXORA Chart Trading Workspace — v1.0.0

## Single active setup

The browser workspace allows one active position plan per local browser profile, across all selected symbols. A Long or Short chart tool creates an editable plan using a 1.5 × recent 14-candle average true range draft stop and 1R, 2R and 3R draft targets. These levels are annotations only; no order is submitted to Binance. Drag the Entry, SL or TP lines to adjust them. Clear the active plan before creating another.

The plan and manual chart drawings are stored in browser localStorage. They are not synced between devices or browsers.

## Chart navigation

- The workspace initially requests up to 1,000 Binance candles for the selected symbol and timeframe.
- Drag horizontally to pan through loaded history.
- When panning to the left edge, the client requests the preceding candle batch using the oldest candle time. History is limited by Binance listing history and API availability.
- Use the mouse wheel to zoom between 30 and 300 visible candles.
- Select LIVE to return to the latest candle.
- The browser continues receiving live candle updates while viewing older history; the viewport stays on the selected historical range until LIVE is selected.

## Indicators

Toggle EMA 20, EMA 50, SMA 200 and Bollinger Bands over the candlestick chart. RSI 14 is shown in a separate lower pane. Indicator calculations use the full locally loaded candle history.

## Manual chart marks

Available tools: horizontal level, trendline, rectangle/zone and text note. Marks are saved locally per symbol. These are manual annotations and do not constitute automatic strategy signals.

## SMC pack

The first SMC pack contains the existing swing structure, BOS/CHoCH, three-candle FVG and equal-high/equal-low calculations, plus basic liquidity-sweep and order-block candidate detection. The latter are deliberately labelled as candidates/confirmations and require trader review; they are not a complete institutional order-flow model.

Confirmation switches cover structure, FVG, order blocks, liquidity sweeps, EQH/EQL, EMA, RSI and volume. The trade desk shows whether selected checks currently align with the chosen direction.

ICT, Alchemist and Order Flow packs are placeholders marked IN DEVELOPMENT. They are not active strategies yet.

## Limitations

- One active plan is enforced in one browser profile using localStorage; it is not a server-side account lock.
- Manual drawings and plans do not synchronize between devices.
- The initial position stop is an ATR-based draft, not personalized risk sizing.
- This release is an analysis and planning tool only. It does not place orders, manage positions or promise trading performance.
- Historical depth is bounded by Binance API availability and symbol listing history.
