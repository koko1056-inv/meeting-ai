import json
import logging
import os

import anthropic

from models.glossary import GlossaryEntry
from services.database import get_db
from services import glossary_manager

logger = logging.getLogger(__name__)

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )
    return _client


async def extract_terms(session_id: str) -> list[GlossaryEntry]:
    """MTG文字起こしから未登録の専門用語を抽出"""

    # 発話ログ取得
    utterances = []
    async for db in get_db():
        cursor = await db.execute(
            """
            SELECT original_text FROM utterances
            WHERE session_id = ? AND is_final = 1
            ORDER BY timestamp
            """,
            (session_id,),
        )
        utterances = await cursor.fetchall()

    if not utterances:
        return []

    transcript = "\n".join(u["original_text"] for u in utterances)

    # 既存用語集
    existing_csv = ""
    cache = glossary_manager.get_cache(session_id)
    if cache:
        existing_csv = "\n".join(f"{e.ja},{e.vi}" for e in cache.entries)

    prompt = f"""以下のMTG文字起こしから、クレーン・ホイスト業界の専門用語、製品名、型番を抽出してください。

【既存用語集】
{existing_csv if existing_csv else "(なし)"}

【指示】
既存用語集に含まれていない新規用語のみを抽出し、以下のJSON配列形式で出力してください:
[{{"ja": "日本語", "vi": "ベトナム語", "note": "備考（自信がない場合は「要確認」）"}}]

翻訳は業界標準の訳語を使用してください。

【文字起こし】
{transcript}"""

    try:
        client = _get_client()
        model = os.getenv("EXTRACT_MODEL", "claude-haiku-4-5")
        response = await client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            items = json.loads(text[start:end])
            return [GlossaryEntry(**item) for item in items]

        return []

    except Exception as e:
        logger.error("Term extraction failed: %s", e)
        return []
