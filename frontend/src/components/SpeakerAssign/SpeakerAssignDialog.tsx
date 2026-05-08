import { useState } from "react";
import type { NewSpeakerDetected, TranslationMessage } from "../../types/websocket";

interface Props {
  speaker: NewSpeakerDetected;
  messages: TranslationMessage[];
  onAssign: (channel: string, speakerId: number, displayName: string) => void;
  onDismiss: () => void;
}

export default function SpeakerAssignDialog({ speaker, messages, onAssign, onDismiss }: Props) {
  const [customName, setCustomName] = useState("");

  const handleAssign = (name: string) => {
    if (!name.trim()) return;
    onAssign(speaker.channel, speaker.speaker_id, name.trim());
  };

  // この話者の直近の発話を最大5件取得
  const speakerUtterances = (messages || [])
    .filter(
      (m) =>
        m.channel === speaker.channel &&
        m.speaker_id === speaker.speaker_id &&
        m.is_final
    )
    .slice(-5);

  return (
    <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-sm font-medium text-yellow-300">
            新しい話者を検出しました ({speaker.channel === "local" ? "ホスト側" : "リモート側"})
          </h4>

          {/* この話者の発話サンプル */}
          <div className="mt-2 space-y-1 bg-gray-900/50 rounded-lg p-2">
            <p className="text-xs text-gray-500 mb-1">この話者の発話:</p>
            {speakerUtterances.length > 0 ? (
              speakerUtterances.map((u, i) => (
                <p key={i} className="text-xs text-gray-300">
                  <span className="text-gray-500 font-mono mr-1">{formatTime(u.timestamp)}</span>
                  「{u.original}」
                </p>
              ))
            ) : (
              <p className="text-xs text-gray-400">
                「{speaker.first_utterance}」
              </p>
            )}
          </div>

          {/* 候補ボタン */}
          {speaker.suggested_names.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {speaker.suggested_names.map((name) => (
                <button
                  key={name}
                  onClick={() => handleAssign(name)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  handleAssign(customName);
              }}
              placeholder="名前を入力"
              className="flex-1 px-3 py-1.5 bg-gray-700 rounded text-white placeholder-gray-400 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => handleAssign(customName)}
              disabled={!customName.trim()}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded text-xs transition-colors"
            >
              割り当て
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-300 text-xs shrink-0"
        >
          後で
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
