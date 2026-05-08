import asyncio
import logging
import os
import re
from typing import Sequence

from models.glossary import GlossaryEntry

logger = logging.getLogger(__name__)

GOOGLE_PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID", "")
GOOGLE_LOCATION = os.getenv("GOOGLE_LOCATION", "asia-northeast1")
GOOGLE_GLOSSARY_BUCKET = os.getenv("GOOGLE_GLOSSARY_BUCKET", "")

_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            from google.cloud import translate_v3
            _client = translate_v3.TranslationServiceAsyncClient()
        except Exception as e:
            logger.warning("Google Translation client init failed: %s", e)
    return _client


class GoogleTranslateService:
    def __init__(self):
        self._glossary_ids: dict[str, str] = {}

    def is_available(self) -> bool:
        available = bool(GOOGLE_PROJECT_ID) and _get_client() is not None
        if not available:
            logger.info(
                "Translation not available: PROJECT_ID=%s, client=%s",
                bool(GOOGLE_PROJECT_ID),
                _get_client() is not None,
            )
        return available

    @property
    def _parent(self) -> str:
        return f"projects/{GOOGLE_PROJECT_ID}/locations/{GOOGLE_LOCATION}"

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        glossary_id: str | None = None,
        glossary_entries: Sequence[GlossaryEntry] | None = None,
    ) -> str:
        if source_lang == target_lang:
            return text

        if not text.strip():
            return text

        client = _get_client()

        # Google Glossary APIが有効な場合はそちらに任せ、無効時のみプレースホルダー方式
        text_to_translate = text
        placeholders: dict[str, str] = {}
        if glossary_entries and not glossary_id:
            sorted_entries = sorted(
                glossary_entries,
                key=lambda e: len(e.ja if source_lang == "ja" else e.vi),
                reverse=True,
            )
            for idx, entry in enumerate(sorted_entries):
                source_term = entry.ja if source_lang == "ja" else entry.vi
                target_term = entry.vi if source_lang == "ja" else entry.ja
                if not source_term or not target_term or source_term == target_term:
                    continue
                if source_term in text_to_translate:
                    ph = f"__TERM{idx}__"
                    placeholders[ph] = target_term
                    text_to_translate = text_to_translate.replace(source_term, ph)

        translated = text_to_translate

        if client and GOOGLE_PROJECT_ID:
            try:
                translated = await self._translate_with_api(
                    client, text_to_translate, source_lang, target_lang, glossary_id
                )
            except Exception as e:
                logger.warning("Google Translation API error, using fallback: %s", e)

        # プレースホルダーを正しい訳語で復元
        for ph, term in placeholders.items():
            translated = translated.replace(ph, term)

        return translated

    async def _translate_with_api(
        self,
        client,
        text: str,
        source_lang: str,
        target_lang: str,
        glossary_id: str | None = None,
    ) -> str:
        from google.cloud import translate_v3

        request = {
            "parent": self._parent,
            "contents": [text],
            "source_language_code": source_lang,
            "target_language_code": target_lang,
            "mime_type": "text/plain",
        }

        if glossary_id:
            glossary_path = f"{self._parent}/glossaries/{glossary_id}"
            request["glossary_config"] = translate_v3.TranslateTextGlossaryConfig(
                glossary=glossary_path,
            )

        response = await client.translate_text(request=request)

        # Glossary翻訳結果を優先
        if glossary_id and response.glossary_translations:
            return response.glossary_translations[0].translated_text

        if response.translations:
            return response.translations[0].translated_text

        return text

    async def create_glossary_from_entries(
        self, session_id: str, entries: Sequence[GlossaryEntry]
    ) -> str | None:
        """用語集エントリからGoogle Glossaryを作成(GCSバケット設定時のみ)"""
        if not GOOGLE_GLOSSARY_BUCKET or not GOOGLE_PROJECT_ID:
            logger.info("Google Glossary skipped: bucket or project not configured")
            return None

        client = _get_client()
        if not client:
            return None

        from services.glossary_manager import generate_google_glossary_csv
        csv_content = generate_google_glossary_csv(entries)

        gcs_uri = await self._upload_to_gcs(session_id, csv_content)
        if not gcs_uri:
            return None

        if session_id in self._glossary_ids:
            await self.delete_glossary(session_id)

        return await self._create_glossary(session_id, gcs_uri)

    async def _upload_to_gcs(self, session_id: str, csv_content: str) -> str | None:
        try:
            from google.cloud import storage

            def _upload():
                gcs_client = storage.Client()
                bucket = gcs_client.bucket(GOOGLE_GLOSSARY_BUCKET)
                blob_name = f"glossaries/{session_id}.csv"
                blob = bucket.blob(blob_name)
                blob.upload_from_string(csv_content, content_type="text/csv")
                return f"gs://{GOOGLE_GLOSSARY_BUCKET}/{blob_name}"

            gcs_uri = await asyncio.to_thread(_upload)
            logger.info("Glossary CSV uploaded to GCS: %s", gcs_uri)
            return gcs_uri
        except Exception as e:
            logger.warning("Failed to upload glossary to GCS: %s", e)
            return None

    async def _create_glossary(
        self, session_id: str, gcs_uri: str
    ) -> str | None:
        client = _get_client()
        if not client:
            return None

        try:
            from google.cloud import translate_v3

            glossary_id = f"meeting-translation-{session_id}"
            glossary_path = f"{self._parent}/glossaries/{glossary_id}"

            glossary = translate_v3.Glossary(
                name=glossary_path,
                language_codes_set=translate_v3.Glossary.LanguageCodesSet(
                    language_codes=["ja", "vi"],
                ),
                input_config=translate_v3.GlossaryInputConfig(
                    gcs_source=translate_v3.GcsSource(input_uri=gcs_uri),
                ),
            )

            operation = await client.create_glossary(
                parent=self._parent, glossary=glossary
            )
            await operation.result(timeout=300)
            self._glossary_ids[session_id] = glossary_id
            logger.info("Glossary created: %s", glossary_id)
            return glossary_id
        except Exception as e:
            logger.error("Failed to create glossary: %s", e)
            return None

    async def delete_glossary(self, session_id: str) -> None:
        glossary_id = self._glossary_ids.pop(session_id, None)
        if not glossary_id:
            return

        client = _get_client()
        if not client:
            return

        try:
            glossary_path = f"{self._parent}/glossaries/{glossary_id}"
            operation = await client.delete_glossary(name=glossary_path)
            await operation.result(timeout=60)
            logger.info("Glossary deleted: %s", glossary_id)
        except Exception as e:
            logger.warning("Failed to delete glossary: %s", e)

    def _translate_with_local_glossary(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        entries: Sequence[GlossaryEntry],
    ) -> str:
        """フォールバック: 用語集の正規表現ベース置換"""
        result = text
        for entry in entries:
            source_term = entry.ja if source_lang == "ja" else entry.vi
            target_term = entry.vi if source_lang == "ja" else entry.ja
            if source_term and target_term and source_term != target_term:
                result = re.sub(re.escape(source_term), target_term, result)
        return result

    def _apply_glossary_override(
        self,
        translated_text: str,
        source_lang: str,
        target_lang: str,
        entries: Sequence[GlossaryEntry],
        original_text: str = "",
    ) -> str:
        """原文に用語集の語が含まれている場合、翻訳結果から該当部分を用語集の訳語で上書き。"""
        if not original_text:
            return translated_text

        result = translated_text
        # 長い用語から先にマッチ (部分一致の誤置換を防止)
        sorted_entries = sorted(
            entries,
            key=lambda e: len(e.ja if source_lang == "ja" else e.vi),
            reverse=True,
        )
        for entry in sorted_entries:
            source_term = entry.ja if source_lang == "ja" else entry.vi
            correct_term = entry.vi if target_lang == "vi" else entry.ja
            if not source_term or not correct_term or source_term == correct_term:
                continue
            if source_term in original_text:
                # 原文にこの用語が含まれている場合、翻訳結果を修正
                # Google翻訳の訳語がどうであれ、用語集の訳語に差し替え
                # 翻訳結果にソース語が残っている場合
                if source_term in result:
                    result = result.replace(source_term, correct_term)
                # Google翻訳の結果が用語集と異なる場合、末尾に注記として追加はしない
                # (文脈依存の翻訳を壊すリスクがあるため)
        return result


translate_service = GoogleTranslateService()
