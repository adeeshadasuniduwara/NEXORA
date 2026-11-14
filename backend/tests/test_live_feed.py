import asyncio

from app.market.live import LiveFeed


def test_slow_subscriber_keeps_latest_event_instead_of_being_removed():
    async def scenario():
        feed = LiveFeed(subscriber_queue_size=2)
        queue = await feed.subscribe()

        await feed.publish({"sequence": 1})
        await feed.publish({"sequence": 2})
        await feed.publish({"sequence": 3})

        assert queue in feed.subscribers
        assert queue.qsize() == 2
        assert queue.get_nowait() == {"sequence": 2}
        assert queue.get_nowait() == {"sequence": 3}
        assert feed.status()["subscriber_count"] == 1
        assert feed.status()["dropped_events"] == 1

    asyncio.run(scenario())


def test_unsubscribe_removes_only_requested_subscriber():
    async def scenario():
        feed = LiveFeed(subscriber_queue_size=2)
        first = await feed.subscribe()
        second = await feed.subscribe()

        await feed.unsubscribe(first)

        assert first not in feed.subscribers
        assert second in feed.subscribers
        assert feed.status()["subscriber_count"] == 1

    asyncio.run(scenario())
