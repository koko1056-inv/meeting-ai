import logging

from fastapi import APIRouter, HTTPException, UploadFile, File

from models.glossary import GlossaryUploadResponse
from services.database import get_db
from services import glossary_manager
from services.google_translate import translate_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.post(
    "/sessions/{session_id}/glossary", response_model=GlossaryUploadResponse
)
async def upload_glossary(session_id: str, file: UploadFile = File(...)):
    async for db in get_db():
        cursor = await db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

    content = await file.read()
    entries = glossary_manager.parse_csv(content)

    if not entries:
        raise HTTPException(status_code=400, detail="No valid entries found in CSV")

    # DB保存
    async for db in get_db():
        await db.execute(
            "DELETE FROM glossary_entries WHERE session_id = ?", (session_id,)
        )
        for entry in entries:
            await db.execute(
                """
                INSERT INTO glossary_entries (session_id, ja, vi, note, source)
                VALUES (?, ?, ?, ?, 'manual')
                """,
                (session_id, entry.ja, entry.vi, entry.note),
            )
        await db.commit()

    # キャッシュ更新
    glossary_manager.update_cache(session_id, entries)

    # Google Glossary API に登録（GCSバケット設定時のみ、未設定時はプレースホルダー方式にフォールバック）
    glossary_id = await translate_service.create_glossary_from_entries(session_id, entries)
    if glossary_id:
        glossary_manager.set_google_glossary_id(session_id, glossary_id)

    return GlossaryUploadResponse(count=len(entries), entries=entries)
