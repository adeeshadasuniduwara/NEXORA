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


## Live market rendering and full pair selector (v1.1.0)

The selected Binance Spot symbol receives trade, kline, book-ticker and partial depth streams. Individual trade events now update the active candle's live high, low and close immediately; chart painting is coalesced to the browser animation frame to avoid a redraw for every incoming message. SMC calculations are throttled separately, while the displayed last price follows each trade. Order-book DOM updates are coalesced to the animation frame so fast depth events do not cause redundant layouts. When the user has panned into history, new market events continue arriving but do not force the viewport back to the latest candle.

The pair selector loads the full list of Binance Spot symbols with status TRADING and Spot trading enabled, sorted alphabetically. Focusing the empty search opens the scrollable full list; typing filters symbols, base assets and quote assets immediately. Results are selected directly from the list.

## Expanded SMC analysis pack

The deterministic SMC engine now identifies and displays:
- External swing structure with HH, HL, LH and LL labels
- BOS and CHoCH events, with event direction sequenced from prior breaks
- Internal swing liquidity sweeps and candidate Inducement (IDM) levels preceding a subsequent structure break
- Equal highs and equal lows
- Bullish and bearish three-candle FVGs and inverted FVG candidates
- Order-block candidates derived from the last opposing candle before a structure break
- Breaker-block candidates after an order block is invalidated
- Mitigation-block candidates on later zone retests
- Premium / Discount dealing range and Equilibrium (EQ)
- Displacement candles, liquidity void candidates and rejection-block candidates

Definitions and confirmation rules vary between SMC methodologies. These deterministic detections are educational candidates, not authoritative labels; the trader should inspect the underlying candles and context. The IDM label is only shown when an internal pivot sweep occurs before a later BOS/CHoCH in the analyzed history. ICT and Alchemist remain separate future packs.

Live rendering is market-data driven, but actual observed latency still depends on Binance's stream delivery, network connection, browser scheduling and device performance. No application can guarantee identical latency to the exchange matching engine.
