import { useState } from "react";
import type { Session } from "../../types/session";

interface Props {
  session: Session | null;
  isLoading: boolean;
  onCreateSession: (hostName: string, diarize: boolean) => void;
  onEndSession: () => void;
}

export default function SessionControl({
  session,
  isLoading,
  onCreateSession,
  onEndSession,
}: Props) {
  const [hostName, setHostName] = useState("");
  const [diarize, setDiarize] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const handleCreate = () => {
    if (!hostName.trim()) return;
    onCreateSession(hostName.trim(), diarize);
  };

  const copyGuestUrl = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.guest_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!session) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">
            STEP 1: セッションを作成する
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            あなたのお名前を入力して、翻訳セッションを開始します。
            セッションを作成すると、相手に共有するためのURLが発行されます。
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleCreate();
            }}
            placeholder="例: 田中太郎"
            className="flex-1 px-4 py-3 bg-gray-700 rounded-lg text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleCreate}
            disabled={isLoading || !hostName.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            {isLoading ? "作成中..." : "セッションを作成"}
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={diarize}
            onChange={(e) => setDiarize(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-xs text-gray-300">
            複数話者モード
          </span>
          <span className="text-xs text-gray-500">
            (同じマイク/画面共有に複数人がいる場合に有効化)
          </span>
        </label>
      </div>
    );
  }

  const statusLabel =
    session.status === "active"
      ? "配信中"
      : session.status === "ended"
      ? "終了済み"
      : "準備完了";

  const statusColor =
    session.status === "active"
      ? "bg-green-900/50 text-green-300 border-green-700"
      : session.status === "ended"
      ? "bg-gray-700 text-gray-400 border-gray-600"
      : "bg-yellow-900/50 text-yellow-300 border-yellow-700";

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      {/* セッション情報 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColor}`}>
              {statusLabel}
            </span>
          </div>

          {/* ゲストURL共有エリア */}
          <div className="bg-gray-900 rounded-lg p-3 mt-3">
            <p className="text-xs text-gray-400 mb-1.5">
              MTG相手にこのURLを送ってください（チャットやメールで共有）
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-indigo-300 bg-gray-800 px-3 py-2 rounded truncate">
                {session.guest_url}
              </code>
              <button
                onClick={copyGuestUrl}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  copied
                    ? "bg-green-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {copied ? "コピーしました!" : "URLをコピー"}
              </button>
            </div>
          </div>
        </div>

        {/* 終了ボタン */}
        {session.status !== "ended" && (
          <div className="shrink-0">
            {!showEndConfirm ? (
              <button
                onClick={() => setShowEndConfirm(true)}
                className="px-4 py-2 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
              >
                セッション終了
              </button>
            ) : (
              <div className="flex flex-col gap-2 items-end">
                <p className="text-xs text-yellow-400">
                  終了すると議事録が生成されます。よろしいですか？
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEndConfirm(false)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => {
                      setShowEndConfirm(false);
                      onEndSession();
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                  >
                    終了する
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
