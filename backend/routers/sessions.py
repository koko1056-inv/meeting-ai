import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from models.session import (
    SessionCreate,
    SessionResponse,
    ParticipantCreate,
    ParticipantResponse,
)
from services.database import get_db
from services.claude_minutes import generate_minutes
from services.term_extractor import extract_terms
from services.google_translate import translate_service
from services import glossary_manager

router = APIRouter(prefix="/api")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _generate_session_id() -> str:
    return uuid.uuid4().hex[:12]


async def _get_participants(db, session_id: str) -> list[ParticipantResponse]:
    cursor = await db.execute(
        "SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at",
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [
        ParticipantResponse(
            id=r["id"],
            session_id=r["session_id"],
            role=r["role"],
            channel=r["channel"],
            display_name=r["display_name"],
            speaker_id=r["speaker_id"],
            joined_at=str(r["joined_at"]),
        )
        for r in rows
    ]


async def _row_to_response(db, row) -> SessionResponse:
    participants = await _get_participants(db, row["id"])
    return SessionResponse(
        id=row["id"],
        host_name=row["host_name"],
        guest_url=row["guest_url"],
        source_lang=row["source_lang"],
        target_lang=row["target_lang"],
        glossary_id=row["glossary_id"],
        diarize_enabled=bool(row["diarize_enabled"]),
        status=row["status"],
        created_at=str(row["created_at"]),
        ended_at=row["ended_at"],
        participants=participants,
    )


@router.post("/sessions", response_model=SessionResponse)
async def create_session(body: SessionCreate):
    session_id = _generate_session_id()
    guest_url = f"{FRONTEND_URL}/guest/{session_id}"

    async for db in get_db():
        await db.execute(
            """
            INSERT INTO sessions (id, host_name, guest_url, source_lang, target_lang, diarize_enabled)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, body.host_name, guest_url, body.source_lang, body.target_lang, body.diarize_enabled),
        )
        # ホストを participants に自動登録
        await db.execute(
            """
            INSERT INTO participants (session_id, role, channel, display_name)
            VALUES (?, 'host', 'local', ?)
            """,
            (session_id, body.host_name),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        return await _row_to_response(db, row)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    async for db in get_db():
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        return await _row_to_response(db, row)


@router.patch("/sessions/{session_id}/end", response_model=SessionResponse)
async def end_session(session_id: str):
    now = datetime.now(timezone.utc).isoformat()

    async for db in get_db():
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute(
            "UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?",
            (now, session_id),
        )
        await db.commit()

        # Google Glossary + キャッシュのクリーンアップ
        await translate_service.delete_glossary(session_id)
        glossary_manager.clear_cache(session_id)

        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        return await _row_to_response(db, row)


@router.post("/sessions/{session_id}/participants", response_model=ParticipantResponse)
async def add_participant(session_id: str, body: ParticipantCreate):
    async for db in get_db():
        cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute(
            """
            INSERT INTO participants (session_id, role, channel, display_name)
            VALUES (?, 'guest', 'remote', ?)
            """,
            (session_id, body.display_name),
        )
        await db.commit()

        cursor = await db.execute(
            "SELECT * FROM participants WHERE session_id = ? AND display_name = ? ORDER BY id DESC LIMIT 1",
            (session_id, body.display_name),
        )
        row = await cursor.fetchone()

    return ParticipantResponse(
        id=row["id"],
        session_id=row["session_id"],
        role=row["role"],
        channel=row["channel"],
        display_name=row["display_name"],
        speaker_id=row["speaker_id"],
        joined_at=str(row["joined_at"]),
    )


@router.get("/sessions/{session_id}/minutes")
async def get_minutes(session_id: str):
    async for db in get_db():
        cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

    return await generate_minutes(session_id)


@router.post("/sessions/{session_id}/extract-terms")
async def extract_session_terms(session_id: str):
    async for db in get_db():
        cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

    terms = await extract_terms(session_id)
    return {"count": len(terms), "terms": terms}
