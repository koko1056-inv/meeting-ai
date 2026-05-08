import json
import logging
import time
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from models.session import TranscriptResult
from services.database import get_db
from services.deepgram_stt import deepgram_service
from services.term_corrector import correct_text
from services.speaker_resolver import speaker_resolver
from services import glossary_manager

logger = logging.getLogger(__name__)

router = APIRouter()

CHANNEL_LOCAL = "local"
CHANNEL_REMOTE = "remote"
CHANNEL_BYTE_LOCAL = 0x00
CHANNEL_BYTE_REMOTE = 0x01


@dataclass
class SessionConnections:
    session_id: str
    host_ws: WebSocket | None = None
    guest_ws_list: list[WebSocket] = field(default_factory=list)
    start_time: float = 0.0
    source_lang: str = "ja"
    target_lang: str = "vi"
    diarize_enabled: bool = False
    _last_interim: dict[str, str] = field(default_factory=dict)
    # channel -> (display_name, role) のキャッシュ (diarize=false 用)
    _speaker_cache: dict[str, tuple[str, str]] = field(default_factory=dict)


class ConnectionManager:
    def __init__(self):
        self._sessions: dict[str, SessionConnections] = {}

    def get_or_create(self, session_id: str) -> SessionConnections:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionConnections(session_id=session_id)
        return self._sessions[session_id]

    def remove_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    async def broadcast(self, session_id: str, message: dict) -> None:
        conn = self._sessions.get(session_id)
        if not conn:
            return
        text = json.dumps(message, ensure_ascii=False)
        targets = []
        if conn.host_ws:
            targets.append(conn.host_ws)
        targets.extend(conn.guest_ws_list)
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:
                pass

    async def send_to_host(self, session_id: str, message: dict) -> None:
        conn = self._sessions.get(session_id)
        if not conn or not conn.host_ws:
            return
        try:
            await conn.host_ws.send_text(json.dumps(message, ensure_ascii=False))
        except Exception:
            pass


manager = ConnectionManager()


async def _load_speaker_cache(conn: SessionConnections) -> None:
    async for db in get_db():
        cursor = await db.execute(
            "SELECT channel, display_name, role FROM participants WHERE session_id = ?",
            (conn.session_id,),
        )
        for row in await cursor.fetchall():
            conn._speaker_cache[row["channel"]] = (row["display_name"], row["role"])


def _resolve_speaker_by_channel(conn: SessionConnections, channel: str) -> tuple[str, str]:
    cached = conn._speaker_cache.get(channel)
    if cached:
        return cached
    return ("Host", "host") if channel == CHANNEL_LOCAL else ("Guest", "guest")


async def _on_transcript(
    session_id: str,
    conn: SessionConnections,
    result: TranscriptResult,
) -> None:
    if not result.text.strip():
        return

    # 重複排除
    interim_key = f"{result.channel}:{result.speaker_id}"
    if not result.is_final:
        last = conn._last_interim.get(interim_key, "")
        if result.text == last:
            return
        conn._last_interim[interim_key] = result.text
    else:
        conn._last_interim.pop(interim_key, None)

    # 用語補正 (Layer 1: ハードコード + Layer 2: 編集距離)
    custom_terms = None
    cache = glossary_manager.get_cache(session_id)
    if cache:
        custom_terms = [e.ja for e in cache.entries] + [e.vi for e in cache.entries]
    correction = correct_text(result.text, custom_terms=custom_terms)
    if correction.corrections:
        logger.info("Term corrected: %s", correction.corrections)
    result.text = correction.corrected

    # 話者名を解決
    speaker_id_out = None
    speaker_unresolved = False

    if conn.diarize_enabled and result.speaker_id is not None:
        elapsed = time.time() - conn.start_time if conn.start_time else 0
        is_new = await speaker_resolver.register_new_speaker(
            session_id, result.channel, result.speaker_id, elapsed
        )
        if is_new:
            suggested = await speaker_resolver.get_suggested_names(session_id)
            await manager.send_to_host(session_id, {
                "type": "new_speaker_detected",
                "channel": result.channel,
                "speaker_id": result.speaker_id,
                "speaker_name": f"Speaker {result.speaker_id}",
                "first_utterance": result.text[:80],
                "timestamp": round(elapsed, 2),
                "suggested_names": suggested,
            })

        speaker_name, speaker_unresolved = await speaker_resolver.resolve(
            session_id, result.channel, result.speaker_id
        )
        speaker_role = "host" if result.channel == CHANNEL_LOCAL else "guest"
        speaker_id_out = result.speaker_id
    else:
        speaker_name, speaker_role = _resolve_speaker_by_channel(conn, result.channel)

    # 翻訳
    translated = result.text
    try:
        from services.google_translate import translate_service
        if translate_service.is_available():
            target = "vi" if result.detected_lang == "ja" else "ja"
            glossary_id = glossary_manager.get_google_glossary_id(session_id)
            glossary_entries = None
            cache = glossary_manager.get_cache(session_id)
            if cache:
                glossary_entries = cache.entries
            translated = await translate_service.translate(
                result.text, result.detected_lang, target,
                glossary_id=glossary_id,
                glossary_entries=glossary_entries,
            )
    except ImportError:
        pass
    except Exception as e:
        logger.warning("Translation error: %s", e)

    elapsed = time.time() - conn.start_time if conn.start_time else 0
    message = {
        "channel": result.channel,
        "lang": result.detected_lang,
        "original": result.text,
        "translated": translated,
        "is_final": result.is_final,
        "timestamp": round(elapsed, 2),
        "speaker_name": speaker_name,
        "speaker_role": speaker_role,
    }
    if speaker_id_out is not None:
        message["speaker_id"] = speaker_id_out
        message["speaker_unresolved"] = speaker_unresolved
    await manager.broadcast(session_id, message)

    # final のみ DB 保存
    if result.is_final:
        try:
            async for db in get_db():
                await db.execute(
                    """INSERT INTO utterances
                    (session_id, channel, speaker_label, dg_speaker_id, language,
                     original_text, translated_text, is_final, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                    (
                        session_id, result.channel, speaker_name, result.speaker_id,
                        result.detected_lang, result.text, translated,
                        round(elapsed, 2),
                    ),
                )
                await db.commit()
        except Exception as e:
            logger.warning("Failed to save utterance: %s", e)


@router.websocket("/ws/session/{session_id}/host")
async def host_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()

    session_row = None
    async for db in get_db():
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = await cursor.fetchone()

    if not session_row:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    conn = manager.get_or_create(session_id)
    conn.host_ws = websocket
    conn.start_time = time.time()
    conn.source_lang = session_row["source_lang"]
    conn.target_lang = session_row["target_lang"]
    conn.diarize_enabled = bool(session_row["diarize_enabled"])

    await _load_speaker_cache(conn)

    async for db in get_db():
        await db.execute(
            "UPDATE sessions SET status = 'active' WHERE id = ? AND status = 'waiting'",
            (session_id,),
        )
        await db.commit()

    # Deepgram は音声データ受信時に遅延初期化
    deepgram_failed: set[str] = set()

    async def transcript_callback(result: TranscriptResult):
        await _on_transcript(session_id, conn, result)

    async def ensure_deepgram(channel: str) -> None:
        if channel in deepgram_failed:
            return
        if deepgram_service.has_connection(session_id, channel):
            return
        kw = glossary_manager.get_deepgram_keywords(session_id, "ja") + \
             glossary_manager.get_deepgram_keywords(session_id, "vi")
        success = await deepgram_service.connect(
            session_id, channel, kw,
            transcript_callback, diarize=conn.diarize_enabled,
        )
        if not success:
            deepgram_failed.add(channel)

    await websocket.send_json({"type": "connected", "session_id": session_id})
    logger.info("Host connected: session=%s, diarize=%s", session_id, conn.diarize_enabled)

    try:
        while True:
            message = await websocket.receive()

            if "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "assign_speaker":
                    await speaker_resolver.assign(
                        session_id, data["channel"],
                        data["speaker_id"], data["display_name"],
                    )
                    await manager.broadcast(session_id, {
                        "type": "speaker_assigned",
                        "channel": data["channel"],
                        "speaker_id": data["speaker_id"],
                        "display_name": data["display_name"],
                    })

            elif "bytes" in message:
                raw = message["bytes"]
                if len(raw) < 2:
                    continue
                channel_byte = raw[0]
                pcm_data = raw[1:]
                channel = CHANNEL_LOCAL if channel_byte == CHANNEL_BYTE_LOCAL else CHANNEL_REMOTE
                await ensure_deepgram(channel)
                await deepgram_service.send_audio(session_id, channel, pcm_data)

    except WebSocketDisconnect:
        logger.info("Host disconnected: session=%s", session_id)
    except Exception as e:
        logger.error("Host WebSocket error: session=%s, error=%s", session_id, e)
    finally:
        conn.host_ws = None
        await deepgram_service.disconnect(session_id)
        speaker_resolver.clear_session(session_id)


@router.websocket("/ws/session/{session_id}/guest")
async def guest_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()

    async for db in get_db():
        cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
        if not await cursor.fetchone():
            await websocket.send_json({"type": "error", "message": "Session not found"})
            await websocket.close()
            return

    conn = manager.get_or_create(session_id)
    conn.guest_ws_list.append(websocket)
    await _load_speaker_cache(conn)

    await websocket.send_json({"type": "connected", "session_id": session_id})
    logger.info("Guest connected: session=%s", session_id)

    try:
        while True:
            message = await websocket.receive()
            if "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger.info("Guest disconnected: session=%s", session_id)
    except Exception as e:
        logger.error("Guest WebSocket error: session=%s, error=%s", session_id, e)
    finally:
        if websocket in conn.guest_ws_list:
            conn.guest_ws_list.remove(websocket)
