# Order-book stream stability

NEXORA consumes Binance Spot partial-depth snapshots for the selected symbol
using the `@depth20@100ms` stream. The server fans these events out to browser
WebSocket subscribers through bounded queues.

A slow browser must not be permanently removed when its queue fills. The live
feed now drops the oldest queued event and enqueues the newest snapshot. This
keeps memory bounded while prioritizing current bid/ask depth over stale updates.
The feed status also exposes subscriber count, dropped-event count, and queue
capacity for diagnostics.

The browser marks the order book as **STALE** when no depth snapshot has arrived
for five seconds, and returns it to **LIVE** when fresh depth resumes. Binance
connection reconnect behavior remains handled by the existing stream client.

Validation: backend tests cover queue overflow, latest-event delivery, and
subscriber retention. A real Binance/network soak test and Windows browser
restart test still need to be run on a live installation.
