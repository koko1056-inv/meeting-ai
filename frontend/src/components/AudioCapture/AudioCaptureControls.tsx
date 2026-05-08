import type { CaptureStatus } from "../../hooks/useAudioCapture";

interface Props {
  status: CaptureStatus;
  errorMessage: string | null;
  localAudioLevel: number;
  remoteAudioLevel: number;
  onStart: () => void;
  onStop: () => void;
}

export default function AudioCaptureControls({
  status,
  errorMessage,
  localAudioLevel,
  remoteAudioLevel,
  onStart,
  onStop,
}: Props) {
  const isActive = status === "active";
  const isRequesting = status === "requesting_mic" || status === "requesting_screen";

  return (
    <div className="space-y-4">
      {/* メインボタン */}
      <div className="flex items-center gap-4">
        {!isActive && !isRequesting && (
          <button
            onClick={onStart}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-base font-medium transition-colors"
          >
            翻訳を開始する
          </button>
        )}
        {isRequesting && (
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-indigo-300">
              {status === "requesting_mic"
                ? "マイクの許可を確認しています..."
                : "画面共有の選択を待っています..."}
            </span>
          </div>
        )}
        {isActive && (
          <button
            onClick={onStop}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-base font-medium transition-colors"
          >
            翻訳を停止する
          </button>
        )}
      </div>

      {/* 許可ダイアログのヒント */}
      {status === "requesting_mic" && (
        <div className="bg-indigo-900/30 border border-indigo-800/50 rounded-lg p-3">
          <p className="text-xs text-indigo-300">
            ブラウザから「マイクの使用を許可しますか？」というダイアログが表示されます。
            <span className="font-medium text-white">「許可」</span>を押してください。
          </p>
        </div>
      )}
      {status === "requesting_screen" && (
        <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
          <p className="text-xs text-emerald-300">
            画面共有のダイアログが表示されます。
            Zoom/Meetが映っている<span className="font-medium text-white">画面またはタブを選択</span>し、
            左下の<span className="font-medium text-yellow-300">「音声を共有」にチェック</span>を入れてから
            「共有」を押してください。
          </p>
        </div>
      )}

      {/* エラー */}
      {errorMessage && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-3">
          <p className="text-sm text-red-300">{errorMessage}</p>
          <button
            onClick={onStart}
            className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            もう一度試す
          </button>
        </div>
      )}

      {/* 取得中ステータス */}
      {isActive && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">🎤 自分の音声</span>
              <span className="text-xs text-green-400">取得中</span>
            </div>
            <AudioLevelBar level={localAudioLevel} />
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">🖥 相手の音声</span>
              <span className="text-xs text-green-400">取得中</span>
            </div>
            <AudioLevelBar level={remoteAudioLevel} />
          </div>
        </div>
      )}
    </div>
  );
}

function AudioLevelBar({ level }: { level: number }) {
  return (
    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-75 ${
          level > 0.5 ? "bg-yellow-500" : "bg-green-500"
        }`}
        style={{ width: `${Math.min(level * 100, 100)}%` }}
      />
    </div>
  );
}
