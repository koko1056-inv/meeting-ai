import { useRef, useEffect, useCallback, useState } from "react";
import type { TranslationMessage } from "../../types/websocket";

interface Props {
  messages: TranslationMessage[];
  maxDisplay?: number;
  diarizeEnabled?: boolean;
  /** 既知の話者名リスト (割当候補) */
  knownSpeakers?: string[];
  /** 話者を手動で割り当てた時のコールバック */
  onReassignSpeaker?: (
    channel: string,
    speakerId: number | null,
    displayName: string,
    timestamp: number
  ) => void;
}

export default function SubtitleOverlay({
  messages,
  maxDisplay = 8,
  diarizeEnabled = false,
  knownSpeakers = [],
  onReassignSpeaker,
}: Props) {
  const hasAnyMessages = messages.length > 0;

  if (!hasAnyMessages) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-dashed border-gray-700">
        <p className="text-gray-400 text-sm">
          音声キャプチャを開始すると、ここにリアルタイムの翻訳字幕が表示されます
        </p>
        <p className="text-gray-500 text-xs mt-1">
          上のボタンで翻訳を開始してください
        </p>
      </div>
    );
  }

  if (diarizeEnabled) {
    return (
      <TimelineView
        messages={messages}
        maxDisplay={maxDisplay * 2}
        knownSpeakers={knownSpeakers}
        onReassignSpeaker={onReassignSpeaker}
      />
    );
  }

  const localMessages = messages.filter((m) => m.channel === "local").slice(-maxDisplay);
  const remoteMessages = messages.filter((m) => m.channel === "remote").slice(-maxDisplay);
  const localSpeaker = [...messages].reverse().find((m) => m.channel === "local" && m.speaker_name)?.speaker_name;
  const remoteSpeaker = [...messages].reverse().find((m) => m.channel === "remote" && m.speaker_name)?.speaker_name;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ChannelSubtitles
        label={localSpeaker ? `🎤 ${localSpeaker}` : "🎤 ホスト"}
        messages={localMessages}
      />
      <ChannelSubtitles
        label={remoteSpeaker ? `🖥 ${remoteSpeaker}` : "🖥 ゲスト"}
        messages={remoteMessages}
      />
    </div>
  );
}

function useSmartScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setIsUserScrolled(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!isUserScrolled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isUserScrolled]);

  return { scrollRef, isUserScrolled, handleScroll, scrollToBottom };
}

/** 話者名バッジ (クリックで再割当) */
function SpeakerBadge({
  msg,
  knownSpeakers,
  onReassign,
}: {
  msg: TranslationMessage;
  knownSpeakers: string[];
  onReassign?: (channel: string, speakerId: number | null, name: string, ts: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [customName, setCustomName] = useState("");

  const colorClass = msg.speaker_unresolved
    ? "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50"
    : msg.speaker_role === "host"
    ? "bg-indigo-900/50 text-indigo-300"
    : "bg-emerald-900/50 text-emerald-300";

  const handleAssign = (name: string) => {
    if (!name.trim() || !onReassign) return;
    onReassign(msg.channel, msg.speaker_id ?? null, name.trim(), msg.timestamp);
    setIsEditing(false);
    setCustomName("");
  };

  if (!onReassign) {
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${colorClass}`}>
        {msg.speaker_name || "Unknown"}
      </span>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setIsEditing(!isEditing)}
        className={`text-xs font-medium px-1.5 py-0.5 rounded cursor-pointer hover:ring-1 hover:ring-gray-500 transition-all ${colorClass}`}
        title="クリックして話者を変更"
      >
        {msg.speaker_name || "Unknown"}
      </button>
      {isEditing && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-xl min-w-[180px]">
          <p className="text-xs text-gray-400 mb-1.5">話者を変更:</p>
          {knownSpeakers.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {knownSpeakers.map((name) => (
                <button
                  key={name}
                  onClick={() => handleAssign(name)}
                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAssign(customName);
                if (e.key === "Escape") setIsEditing(false);
              }}
              placeholder="名前を入力"
              className="flex-1 px-2 py-1 bg-gray-700 rounded text-white placeholder-gray-400 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
            <button
              onClick={() => handleAssign(customName)}
              disabled={!customName.trim()}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded text-xs transition-colors"
            >
              OK
            </button>
          </div>
          <button
            onClick={() => setIsEditing(false)}
            className="text-xs text-gray-500 hover:text-gray-300 mt-1.5 w-full text-center"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

function TimelineView({
  messages,
  maxDisplay,
  knownSpeakers = [],
  onReassignSpeaker,
}: {
  messages: TranslationMessage[];
  maxDisplay: number;
  knownSpeakers?: string[];
  onReassignSpeaker?: (channel: string, speakerId: number | null, name: string, ts: number) => void;
}) {
  const { scrollRef, isUserScrolled, handleScroll, scrollToBottom } = useSmartScroll();
  const visible = messages.slice(-maxDisplay);

  useEffect(() => {
    scrollToBottom();
  }, [visible, scrollToBottom]);

  return (
    <div className="bg-gray-800/70 rounded-xl p-4 border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-white">翻訳字幕</h3>
          {onReassignSpeaker && (
            <p className="text-xs text-gray-500">話者名をクリックして変更できます</p>
          )}
        </div>
        {isUserScrolled && (
          <button
            onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded"
          >
            最新に移動
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="space-y-2.5 max-h-[400px] overflow-y-auto"
      >
        {visible.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`text-sm transition-opacity duration-200 ${
              msg.is_final ? "opacity-100" : "opacity-50 italic"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-gray-500 text-xs mt-0.5 shrink-0 font-mono">
                {formatTime(msg.timestamp)}
              </span>
              <SpeakerBadge
                msg={msg}
                knownSpeakers={knownSpeakers}
                onReassign={onReassignSpeaker}
              />
              <div className="flex-1">
                <p className="text-white leading-relaxed">{msg.original}</p>
                <p className="text-blue-300 text-xs mt-0.5 leading-relaxed">
                  ↳ {msg.translated}
                </p>
              </div>
              {!msg.is_final && (
                <span className="text-xs text-gray-500 shrink-0">認識中...</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelSubtitles({
  label,
  messages,
}: {
  label: string;
  messages: TranslationMessage[];
}) {
  const { scrollRef, isUserScrolled, handleScroll, scrollToBottom } = useSmartScroll();

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <div className="bg-gray-800/70 rounded-xl p-4 min-h-[220px] border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">{label}</h3>
        {isUserScrolled && (
          <button
            onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded"
          >
            最新へ
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="space-y-2.5 max-h-[300px] overflow-y-auto"
      >
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">音声を待機中...</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`text-sm transition-opacity duration-200 ${
              msg.is_final ? "opacity-100" : "opacity-50 italic"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-gray-500 text-xs mt-0.5 shrink-0 font-mono">
                {formatTime(msg.timestamp)}
              </span>
              <div className="flex-1">
                <p className="text-white leading-relaxed">{msg.original}</p>
                <p className="text-blue-300 text-xs mt-0.5 leading-relaxed">
                  ↳ {msg.translated}
                </p>
              </div>
              {!msg.is_final && (
                <span className="text-xs text-gray-500 shrink-0">認識中...</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
