import asyncio
import json
import logging
import os
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Awaitable

import websockets

from models.session import TranscriptResult

logger = logging.getLogger(__name__)

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


@dataclass
class DeepgramConnection:
    session_id: str
    channel: str
    ws: websockets.WebSocketClientProtocol | None = None
    recv_task: asyncio.Task | None = None


TranscriptCallback = Callable[[TranscriptResult], Awaitable[None]]


class DeepgramSTTService:
    def __init__(self):
        self._connections: dict[str, dict[str, DeepgramConnection]] = {}

    async def connect(
        self,
        session_id: str,
        channel: str,
        keywords: list[str],
        on_transcript: TranscriptCallback,
        diarize: bool = False,
    ) -> bool:
        if not DEEPGRAM_API_KEY:
            logger.warning("DEEPGRAM_API_KEY not set, STT disabled")
            return False

        from urllib.parse import quote

        parts = [
            "model=nova-3",
            "language=multi",
            "punctuate=true",
            "smart_format=true",
            "interim_results=true",
            "endpointing=300",
            "sample_rate=16000",
            "encoding=linear16",
            "channels=1",
        ]

        if diarize:
            parts.append("diarize=true")

        # Nova-3 は keywords パラメータ非対応。Nova-2 では対応。
        # keywords ブーストが必要な場合は model=nova-2 に切り替え可能
        # 現在は Nova-3 の高精度モデル + 翻訳時の用語集補正で対応

        url = f"{DEEPGRAM_WS_URL}?{'&'.join(parts)}"
        logger.info("Deepgram URL length: %d, keywords: %d", len(url), len(keywords[:20]))

        headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}

        try:
            ws = await websockets.connect(url, additional_headers=headers)
            conn = DeepgramConnection(
                session_id=session_id, channel=channel, ws=ws
            )

            if session_id not in self._connections:
                self._connections[session_id] = {}
            self._connections[session_id][channel] = conn

            conn.recv_task = asyncio.create_task(
                self._receive_loop(conn, on_transcript)
            )

            logger.info(
                "Deepgram connected: session=%s, channel=%s, diarize=%s, keywords=%d",
                session_id, channel, diarize, len(keywords),
            )
            return True
        except Exception as e:
            logger.error(
                "Deepgram connection failed: session=%s, channel=%s, error=%s",
                session_id, channel, e,
            )
            return False

    async def _receive_loop(
        self, conn: DeepgramConnection, callback: TranscriptCallback
    ) -> None:
        try:
            async for raw_msg in conn.ws:
                try:
                    msg = json.loads(raw_msg)

                    if msg.get("type") == "Results":
                        channel_result = msg.get("channel", {})
                        alternatives = channel_result.get("alternatives", [])
                        if not alternatives:
                            continue

                        alt = alternatives[0]
                        transcript = alt.get("transcript", "").strip()
                        if not transcript:
                            continue

                        # 言語検出
                        detected_lang = "ja"
                        languages = alt.get("languages", [])
                        if languages:
                            lang_code = languages[0]
                            if lang_code.startswith("vi"):
                                detected_lang = "vi"
                            elif lang_code.startswith("ja"):
                                detected_lang = "ja"

                        is_final = msg.get("is_final", False)

                        # diarize: words から最頻出 speaker_id を抽出
                        speaker_id = None
                        words = alt.get("words", [])
                        speaker_ids = [w["speaker"] for w in words if "speaker" in w]
                        if speaker_ids:
                            speaker_id = Counter(speaker_ids).most_common(1)[0][0]

                        await callback(TranscriptResult(
                            channel=conn.channel,
                            detected_lang=detected_lang,
                            text=transcript,
                            is_final=is_final,
                            speaker_id=speaker_id,
                        ))

                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    logger.warning("Deepgram message processing error: %s", e)
        except websockets.ConnectionClosed:
            logger.info(
                "Deepgram connection closed: session=%s, channel=%s",
                conn.session_id, conn.channel,
            )
        except Exception as e:
            logger.error("Deepgram receive loop error: %s", e)

    async def send_audio(
        self, session_id: str, channel: str, pcm_data: bytes
    ) -> None:
        conns = self._connections.get(session_id)
        if not conns:
            return
        conn = conns.get(channel)
        if not conn or not conn.ws:
            return
        try:
            await conn.ws.send(pcm_data)
        except Exception as e:
            logger.warning(
                "Failed to send audio to Deepgram: session=%s, channel=%s, error=%s",
                session_id, channel, e,
            )

    def has_connections(self, session_id: str) -> bool:
        return session_id in self._connections and bool(self._connections[session_id])

    def has_connection(self, session_id: str, channel: str) -> bool:
        conns = self._connections.get(session_id)
        if not conns:
            return False
        conn = conns.get(channel)
        return conn is not None and conn.ws is not None

    async def disconnect(self, session_id: str, channel: str | None = None) -> None:
        conns = self._connections.get(session_id)
        if not conns:
            return

        channels = [channel] if channel else list(conns.keys())
        for ch in channels:
            conn = conns.pop(ch, None)
            if not conn:
                continue
            if conn.recv_task:
                conn.recv_task.cancel()
            if conn.ws:
                try:
                    await conn.ws.close()
                except Exception:
                    pass
            logger.info(
                "Deepgram disconnected: session=%s, channel=%s",
                session_id, ch,
            )

        if not conns:
            self._connections.pop(session_id, None)


deepgram_service = DeepgramSTTService()
