import { useState, useRef } from "react";
import type { GlossaryEntry } from "../../types/session";

const API_URL = import.meta.env.VITE_API_URL || "";

interface Props {
  sessionId: string;
  disabled?: boolean;
}

export default function GlossaryUpload({ sessionId, disabled = false }: Props) {
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${API_URL}/api/sessions/${sessionId}/glossary`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "アップロードに失敗しました");
      }
      const data = await res.json();
      setEntries(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h3 className="text-sm font-medium text-white">
              専門用語集（任意）
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-7">
            製品名や専門用語のCSVファイルをアップロードすると、翻訳精度が向上します。
            未登録でもMTGは開始できます。
          </p>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap ml-4"
        >
          {showHelp ? "閉じる" : "CSV形式について"}
        </button>
      </div>

      {showHelp && (
        <div className="bg-gray-900 rounded-lg p-3 mb-3 ml-7">
          <p className="text-xs text-gray-300 mb-2">
            CSVファイルは以下の形式で作成してください（UTF-8）:
          </p>
          <pre className="text-xs text-gray-400 bg-gray-800 p-2 rounded font-mono">
{`ja,vi,note
天井クレーン,Cần trục treo,Overhead crane
ホイスト,Pa lăng,Hoist
HB-200,HB-200,型番のため翻訳不要`}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            ※ note列は任意です。型番など翻訳不要な語は日本語とベトナム語を同じ値にしてください。
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 ml-7">
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading || disabled}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
        >
          {isUploading ? "アップロード中..." : disabled ? "翻訳中は変更不可" : "CSVファイルを選択"}
        </button>
        {entries.length > 0 && (
          <span className="text-xs text-green-400">
            {entries.length}件の専門用語を登録しました
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {entries.length > 0 && (
        <div className="mt-3 ml-7 max-h-40 overflow-y-auto border border-gray-700 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">日本語</th>
                <th className="text-left py-2 px-3">ベトナム語</th>
                <th className="text-left py-2 px-3">備考</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="py-1.5 px-3 text-white">{entry.ja}</td>
                  <td className="py-1.5 px-3 text-blue-300">{entry.vi}</td>
                  <td className="py-1.5 px-3 text-gray-400">{entry.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
