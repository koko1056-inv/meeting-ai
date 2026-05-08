import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useTranslationWebSocket } from "../hooks/useTranslationWebSocket";
import SubtitleOverlay from "../components/SubtitleOverlay/SubtitleOverlay";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function GuestPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, getSession } = useSession();
  const { isConnected, messages, connect } = useTranslationWebSocket();
  const [guestName, setGuestName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId);
  }, [sessionId, getSession]);

  const handleJoin = useCallback(async () => {
    if (!guestName.trim() || !sessionId) return;
    setIsJoining(true);
    try {
      await fetch(`${API_URL}/api/sessions/${sessionId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: guestName.trim() }),
      });
      connect(sessionId, "guest");
      setIsJoined(true);
    } catch (e) {
      console.error("Failed to join:", e);
    } finally {
      setIsJoining(false);
    }
  }, [guestName, sessionId, connect]);

  // 参加前の案内画面
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6">
          {/* ヘッダー */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              リアルタイム翻訳
            </h1>
            <p className="text-sm text-gray-400 mt-1">Innovation Hub</p>
          </div>

          {/* 案内 */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-sm text-gray-300 mb-4">
              このページでは、MTG中の会話がリアルタイムで翻訳表示されます。
              お名前を入力して参加してください。
            </p>

            {session && (
              <div className="bg-gray-900 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-400">MTGホスト</p>
                <p className="text-sm text-white">{session.host_name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {session.source_lang.toUpperCase()} ⇔ {session.target_lang.toUpperCase()}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  あなたのお名前
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleJoin();
                  }}
                  placeholder="例: Nguyen Van A"
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={isJoining || !guestName.trim()}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isJoining ? "参加中..." : "翻訳字幕を表示する"}
              </button>
            </div>
          </div>

          {/* 使い方ヒント */}
          <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-xl p-4">
            <h3 className="text-xs font-medium text-indigo-300 mb-2">
              使い方
            </h3>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>・ 参加ボタンを押すと、MTGの翻訳字幕がリアルタイムで表示されます</li>
              <li>・ あなた側の操作（マイクや画面共有）は不要です</li>
              <li>・ このページを開いたまま、Zoom/Meetでの通話を続けてください</li>
              <li>・ MTG終了後、議事録が自動生成されます</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // 参加後の字幕表示画面
  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              リアルタイム翻訳
            </h1>
            <p className="text-xs text-gray-400">Innovation Hub</p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected ? (
              <span className="text-xs text-green-400 flex items-center gap-1.5 bg-green-900/30 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                接続中
              </span>
            ) : (
              <span className="text-xs text-yellow-400">接続待ち...</span>
            )}
          </div>
        </div>

        {session && (
          <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">
                ホスト: <span className="text-white">{session.host_name}</span>
                {" / "}
                ゲスト: <span className="text-white">{guestName}</span>
              </p>
            </div>
          </div>
        )}

        <SubtitleOverlay messages={messages} />

        {session?.status === "ended" && sessionId && (
          <div className="text-center bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-300 mb-2">MTGが終了しました</p>
            <Link
              to={`/minutes/${sessionId}`}
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
            >
              議事録を表示する
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
