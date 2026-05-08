"""
音声認識結果の専門用語補正 (リアルタイムパイプライン用)

Layer 1: ハードコード辞書 - 既知の誤認識パターンを即座に補正 (O(1))
Layer 2: 編集距離検索 - 未知の誤りを用語集から類似語で補正 (<1ms)
"""

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Layer 1: 既知の認識誤りパターン → 正しい用語
# 運用で発見された誤パターンをここに追加していく
KNOWN_CORRECTIONS: dict[str, str] = {
    "科重試験": "荷重試験",
    "可重試験": "荷重試験",
    "加重試験": "荷重試験",
    "過重試験": "荷重試験",
    "定格科重": "定格荷重",
    "定格加重": "定格荷重",
    "定格過重": "定格荷重",
    "定格家事": "定格荷重",
    "カフカ防腐装置": "過負荷防止装置",
    "科負荷防止装置": "過負荷防止装置",
    "加負荷防止装置": "過負荷防止装置",
    "巻き上げ機": "巻上機",
    "巻上げ機": "巻上機",
    "巻き上機": "巻上機",
    "ワイヤーロープ": "ワイヤロープ",
    "走行レイル": "走行レール",
}

# 編集距離で誤補正しやすい語の除外リスト
# (業界用語と距離が近いが別の意味を持つ一般語)
EXCLUDE_FROM_FUZZY: set[str] = {
    "銀行",  # 「横行」と距離1
    "実験",  # 「試験」と距離1
    "発行",  # 「横行」と距離1
}

# 業界共通用語 (編集距離検索の対象)
INDUSTRY_TERMS: list[str] = [
    "荷重試験", "定格荷重", "過負荷防止装置", "天井クレーン",
    "ジブクレーン", "ホイスト", "巻上機", "ワイヤロープ",
    "安全装置", "走行レール", "横行", "シーブ", "ブレーキ",
    "HB型ホイスト",
]


def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            cost = 0 if c1 == c2 else 1
            curr_row.append(min(
                curr_row[j] + 1,
                prev_row[j + 1] + 1,
                prev_row[j] + cost,
            ))
        prev_row = curr_row
    return prev_row[-1]


@dataclass
class CorrectionResult:
    original: str
    corrected: str
    corrections: list[tuple[str, str]]  # (誤 → 正) のリスト


def correct_text(
    text: str,
    custom_terms: list[str] | None = None,
    max_distance: int = 2,
) -> CorrectionResult:
    """
    認識テキストの専門用語を補正する。

    Args:
        text: Deepgramの認識結果テキスト
        custom_terms: CSV用語集から追加された顧客固有の用語
        max_distance: 編集距離の閾値 (デフォルト2)
    """
    corrections: list[tuple[str, str]] = []
    result = text

    # Layer 1: ハードコード辞書 (完全一致、長い語から優先)
    sorted_corrections = sorted(KNOWN_CORRECTIONS.items(), key=lambda x: len(x[0]), reverse=True)
    for wrong, correct in sorted_corrections:
        if wrong in result:
            result = result.replace(wrong, correct)
            corrections.append((wrong, correct))

    # Layer 2: 編集距離検索
    all_terms = list(INDUSTRY_TERMS)
    if custom_terms:
        all_terms.extend(t for t in custom_terms if t not in all_terms)

    if not all_terms:
        return CorrectionResult(original=text, corrected=result, corrections=corrections)

    # テキストをチャンク分割して用語候補と比較
    # 日本語は単語境界がないため、用語の文字数に近いN-gramで検索
    for term in all_terms:
        term_len = len(term)
        if term_len < 4:
            continue  # 3文字以下は誤補正リスクが高いのでスキップ
        if term in result:
            continue  # 既に正しい用語が含まれている

        # 用語の長さに応じた距離閾値 (短い語ほど厳しく)
        effective_max = 1 if term_len <= 5 else max_distance

        # N-gram スキャン: term_len-1 ~ term_len+1 の窓幅で走査
        for window in range(term_len - 1, term_len + 2):
            if window < 4 or window > len(result):
                continue
            for i in range(len(result) - window + 1):
                chunk = result[i:i + window]
                if chunk in EXCLUDE_FROM_FUZZY:
                    continue
                if chunk == term:
                    continue
                dist = levenshtein_distance(chunk, term)
                if 0 < dist <= effective_max:
                    # 距離が閾値以内 → 補正
                    # ただし、元の語が他の正しい用語の一部でないか確認
                    result = result.replace(chunk, term, 1)
                    corrections.append((chunk, term))
                    break  # この用語について1回補正したら次の用語へ
            else:
                continue
            break

    return CorrectionResult(original=text, corrected=result, corrections=corrections)
