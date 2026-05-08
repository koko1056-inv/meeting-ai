import logging

from services.database import get_db

logger = logging.getLogger(__name__)


class SpeakerResolver:
    def __init__(self):
        # (session_id, channel, dg_speaker_id) -> display_name | None
        self._cache: dict[tuple[str, str, int], str | None] = {}
        # session_id -> set of known (channel, dg_speaker_id)
        self._known: dict[str, set[tuple[str, int]]] = {}

    async def register_new_speaker(
        self, session_id: str, channel: str, dg_speaker_id: int, timestamp: float
    ) -> bool:
        """新しい speaker を検出したら DB に登録。新規なら True を返す。"""
        key = (channel, dg_speaker_id)
        known = self._known.setdefault(session_id, set())
        if key in known:
            # 既知: 発話カウントを更新
            async for db in get_db():
                await db.execute(
                    """UPDATE speaker_mappings SET utterance_count = utterance_count + 1
                    WHERE session_id = ? AND channel = ? AND dg_speaker_id = ?""",
                    (session_id, channel, dg_speaker_id),
                )
                await db.commit()
            return False

        known.add(key)
        async for db in get_db():
            await db.execute(
                """INSERT OR IGNORE INTO speaker_mappings
                (session_id, channel, dg_speaker_id, first_seen_at)
                VALUES (?, ?, ?, ?)""",
                (session_id, channel, dg_speaker_id, round(timestamp, 2)),
            )
            await db.commit()
        logger.info(
            "New speaker detected: session=%s channel=%s speaker=%d",
            session_id, channel, dg_speaker_id,
        )
        return True

    async def resolve(
        self, session_id: str, channel: str, dg_speaker_id: int
    ) -> tuple[str, bool]:
        """(display_name, is_unresolved) を返す。"""
        cache_key = (session_id, channel, dg_speaker_id)
        if cache_key in self._cache and self._cache[cache_key] is not None:
            return self._cache[cache_key], False

        async for db in get_db():
            cursor = await db.execute(
                """SELECT display_name FROM speaker_mappings
                WHERE session_id = ? AND channel = ? AND dg_speaker_id = ?""",
                (session_id, channel, dg_speaker_id),
            )
            row = await cursor.fetchone()

        if row and row["display_name"]:
            self._cache[cache_key] = row["display_name"]
            return row["display_name"], False

        fallback = f"Speaker {dg_speaker_id}"
        return fallback, True

    async def assign(
        self, session_id: str, channel: str, dg_speaker_id: int, display_name: str
    ) -> None:
        async for db in get_db():
            await db.execute(
                """UPDATE speaker_mappings SET display_name = ?
                WHERE session_id = ? AND channel = ? AND dg_speaker_id = ?""",
                (display_name, session_id, channel, dg_speaker_id),
            )
            await db.commit()
        self._cache[(session_id, channel, dg_speaker_id)] = display_name
        logger.info(
            "Speaker assigned: session=%s channel=%s speaker=%d -> %s",
            session_id, channel, dg_speaker_id, display_name,
        )

    async def get_suggested_names(self, session_id: str) -> list[str]:
        """事前登録済みだが未割当の参加者名を返す。"""
        assigned: set[str] = set()
        async for db in get_db():
            cursor = await db.execute(
                "SELECT display_name FROM speaker_mappings WHERE session_id = ? AND display_name IS NOT NULL",
                (session_id,),
            )
            for row in await cursor.fetchall():
                assigned.add(row["display_name"])

            cursor = await db.execute(
                "SELECT display_name FROM participants WHERE session_id = ?",
                (session_id,),
            )
            all_names = [row["display_name"] for row in await cursor.fetchall()]

        return [n for n in all_names if n not in assigned]

    def clear_session(self, session_id: str) -> None:
        self._known.pop(session_id, None)
        keys_to_remove = [k for k in self._cache if k[0] == session_id]
        for k in keys_to_remove:
            del self._cache[k]


speaker_resolver = SpeakerResolver()
