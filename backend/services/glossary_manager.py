import csv
import io
import logging
from dataclasses import dataclass, field

from models.glossary import GlossaryEntry

logger = logging.getLogger(__name__)


@dataclass
class GlossaryData:
    entries: list[GlossaryEntry] = field(default_factory=list)
    deepgram_keywords_ja: list[str] = field(default_factory=list)
    deepgram_keywords_vi: list[str] = field(default_factory=list)
    google_glossary_id: str | None = None


# セッション別の用語集キャッシュ
_cache: dict[str, GlossaryData] = {}


def parse_csv(content: bytes) -> list[GlossaryEntry]:
    """UTF-8 BOM対応のCSVパース"""
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    entries = []
    for row in reader:
        ja = row.get("ja", "").strip()
        vi = row.get("vi", "").strip()
        if not ja or not vi:
            continue
        entries.append(
            GlossaryEntry(ja=ja, vi=vi, note=row.get("note", "").strip() or None)
        )
    return entries


def generate_deepgram_keywords(entries: list[GlossaryEntry], lang: str) -> list[str]:
    """Deepgram keywords形式に変換。型番(ja==vi)はブースト値3、通常用語は2。"""
    keywords = []
    for entry in entries:
        is_model_number = entry.ja == entry.vi
        boost = 3 if is_model_number else 2
        term = entry.ja if lang == "ja" else entry.vi
        keywords.append(f"{term}:{boost}")
    return keywords


def generate_google_glossary_csv(entries: list[GlossaryEntry]) -> str:
    """Google Translation Glossary API用のCSV文字列を生成"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ja", "vi"])
    for entry in entries:
        writer.writerow([entry.ja, entry.vi])
    return output.getvalue()


def generate_claude_prompt_section(entries: list[GlossaryEntry]) -> str:
    """Claude System Promptに注入する用語集テキストを生成"""
    if not entries:
        return ""
    lines = ["| 日本語 | ベトナム語 | 備考 |", "|---|---|---|"]
    for entry in entries:
        note = entry.note or ""
        lines.append(f"| {entry.ja} | {entry.vi} | {note} |")
    return "\n".join(lines)


def update_cache(session_id: str, entries: list[GlossaryEntry]) -> GlossaryData:
    """セッションの用語集キャッシュを更新"""
    data = GlossaryData(
        entries=entries,
        deepgram_keywords_ja=generate_deepgram_keywords(entries, "ja"),
        deepgram_keywords_vi=generate_deepgram_keywords(entries, "vi"),
    )
    _cache[session_id] = data
    logger.info(
        "Glossary cache updated: session=%s, entries=%d", session_id, len(entries)
    )
    return data


def get_cache(session_id: str) -> GlossaryData | None:
    return _cache.get(session_id)


def get_deepgram_keywords(session_id: str, lang: str) -> list[str]:
    data = _cache.get(session_id)
    if not data:
        return []
    return data.deepgram_keywords_ja if lang == "ja" else data.deepgram_keywords_vi


def get_google_glossary_id(session_id: str) -> str | None:
    data = _cache.get(session_id)
    return data.google_glossary_id if data else None


def set_google_glossary_id(session_id: str, glossary_id: str) -> None:
    data = _cache.get(session_id)
    if data:
        data.google_glossary_id = glossary_id


def clear_cache(session_id: str) -> None:
    _cache.pop(session_id, None)
