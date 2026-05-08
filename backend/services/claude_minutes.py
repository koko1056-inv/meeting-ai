import json
import logging
import os
import re

import anthropic

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


async def generate_minutes(session_id: str) -> dict:
    # 発話ログ取得
    utterances = []
    async for db in get_db():
        cursor = await db.execute(
            """
            SELECT channel, speaker_label, language, original_text, translated_text, timestamp
            FROM utterances
            WHERE session_id = ? AND is_final = 1
            ORDER BY timestamp
            """,
            (session_id,),
        )
        utterances = await cursor.fetchall()

    if not utterances:
        return {
            "utterances": [],
            "summary": {"ja": "発話ログがありません。", "vi": "Khong co nhat ky phat bieu."},
        }

    # 発話ログをJSON構造で構築
    utterance_list = []
    for u in utterances:
        speaker = u["speaker_label"] or ("Host" if u["channel"] == "local" else "Guest")
        utterance_list.append({
            "time": _format_time(u["timestamp"]),
            "speaker": speaker,
            "lang": u["language"],
            "original": u["original_text"],
            "translated": u["translated_text"],
        })

    # 用語集テキスト
    glossary_text = ""
    cache = glossary_manager.get_cache(session_id)
    if cache:
        glossary_text = glossary_manager.generate_claude_prompt_section(cache.entries)

    system_prompt = "あなたは会議の議事録を作成する専門家です。"
    if glossary_text:
        system_prompt += f"\n\n用語集に従って翻訳してください:\n{glossary_text}"

    user_prompt = f"""以下のMTG文字起こしから、構造化された議事録サマリーを生成してください。

【出力フォーマット】
以下のJSON形式で出力してください。JSONのみ出力し、マークダウンのコードブロックで囲まないでください。

{{
  "title_ja": "会議のタイトル（日本語）",
  "title_vi": "会議のタイトル（ベトナム語）",
  "participants": ["参加者1", "参加者2"],
  "topics_ja": ["議題1", "議題2"],
  "topics_vi": ["議題1(ベトナム語)", "議題2(ベトナム語)"],
  "decisions_ja": ["決定事項1", "決定事項2"],
  "decisions_vi": ["決定事項1(ベトナム語)", "決定事項2(ベトナム語)"],
  "actions": [
    {{"task_ja": "タスク内容", "task_vi": "タスク内容(ベトナム語)", "assignee": "担当者", "deadline": "期限"}}
  ]
}}

【文字起こし】
{json.dumps(utterance_list, ensure_ascii=False, indent=2)}"""

    try:
        client = _get_client()
        model = os.getenv("MINUTES_MODEL", "claude-sonnet-4-6")
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = response.content[0].text.strip()
        # コードブロック除去
        text = re.sub(r"```(?:json)?\s*", "", text).strip()

        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                summary = json.loads(text[start:end])
            except json.JSONDecodeError:
                summary = {"error": "議事録のパースに失敗しました"}
        else:
            summary = {"error": "議事録の生成に失敗しました"}

        return {
            "utterances": utterance_list,
            "summary": summary,
        }

    except Exception as e:
        logger.error("Minutes generation failed: %s", e)
        return {
            "utterances": utterance_list,
            "summary": {"error": f"議事録生成に失敗しました: {e}"},
        }


def _format_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"
