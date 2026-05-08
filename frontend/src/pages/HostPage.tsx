import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useTranslationWebSocket } from "../hooks/useTranslationWebSocket";
import { useAudioCapture } from "../hooks/useAudioCapture";
import SessionControl from "../components/SessionControl/SessionControl";
import AudioCaptureControls from "../components/AudioCapture/AudioCaptureControls";
import SubtitleOverlay from "../components/SubtitleOverlay/SubtitleOverlay";
import GlossaryUpload from "../components/GlossaryUpload/GlossaryUpload";
import SpeakerAssignDialog from "../components/SpeakerAssign/SpeakerAssignDialog";

export default function HostPage() {
  const navigate = useNavigate();
  const { session, isLoading, createSession, endSession } = useSession();
  const {
    isConnected, messages, unresolvedSpeakers,
    connect, disconnect, sendAudio, assignSpeaker,
  } = useTranslationWebSocket();
  const audioCapture = useAudioCapture(sendAudio);
  const [dismissedSpeakers, setDismissedSpeakers] = useState<Set<string>>(new Set());

  const handleCreateSession = useCallback(
    async (hostName: string, diarize: boolean) => {
      const s = await createSession(hostName, diarize);
      if (s) {
        connect(s.id, "host");
      }
    },
    [createSession, connect]
  );

  const handleEndSession = useCallback(async () => {
    audioCapture.stopAll();
    disconnect();
    const s = await endSession();
    if (s) {
      navigate(`/minutes/${s.id}`);
    }
  }, [audioCapture, disconnect, endSession, navigate]);

  const visibleUnresolved = unresolvedSpeakers.filter(
    (s) => !dismissedSpeakers.has(`${s.channel}:${s.speaker_id}`)
  );

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white">
              リアルタイム翻訳システム
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Innovation Hub - 日本語⇔ベトナム語のMTG同時翻訳
            </p>
          </div>
          {session && (
            <div className="flex items-center gap-2">
              {isConnected ? (
                <span className="text-xs text-green-400 flex items-center gap-1.5 bg-green-900/30 px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  サーバー接続中
                </span>
              ) : (
                <span className="text-xs text-yellow-400 flex items-center gap-1.5 bg-yellow-900/30 px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  再接続中...
                </span>
              )}
            </div>
          )}
        </div>

        {/* 使い方ガイド */}
        {!session && (
          <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-xl p-5">
            <h2 className="text-sm font-medium text-indigo-300 mb-3">
              このツールの使い方
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Zoom/Google Meetと併用して、MTGの音声をリアルタイムで翻訳します。
              まずZoom/Meetを起動してから、以下の手順で進めてください。
            </p>
            <ol className="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
              <li>下のフォームでセッションを作成します</li>
              <li>発行されたURLをMTG相手にチャット等で共有します</li>
              <li>「翻訳を開始する」ボタンを押して、マイクと画面音声を許可します</li>
              <li>発話内容がリアルタイムで翻訳・表示されます</li>
              <li>MTG終了時に「セッション終了」を押すと議事録が自動生成されます</li>
            </ol>
          </div>
        )}

        <SessionControl
          session={session}
          isLoading={isLoading}
          onCreateSession={handleCreateSession}
          onEndSession={handleEndSession}
        />

        {session && session.status !== "ended" && (
          <>
            <GlossaryUpload
              sessionId={session.id}
              disabled={audioCapture.status !== "idle"}
            />

            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-white">
                  STEP 2: 翻訳を開始する
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  ボタンを押すと、マイクの許可と画面共有の選択が順番に表示されます。
                  両方を許可すると翻訳が始まります。
                </p>
              </div>
              <AudioCaptureControls
                status={audioCapture.status}
                errorMessage={audioCapture.errorMessage}
                localAudioLevel={audioCapture.localAudioLevel}
                remoteAudioLevel={audioCapture.remoteAudioLevel}
                onStart={audioCapture.startAll}
                onStop={audioCapture.stopAll}
              />
            </div>

            {/* 話者割当通知 */}
            {visibleUnresolved.length > 0 && (
              <div className="space-y-3">
                {visibleUnresolved.map((s) => (
                  <SpeakerAssignDialog
                    key={`${s.channel}:${s.speaker_id}`}
                    speaker={s}
                    messages={messages}
                    onAssign={assignSpeaker}
                    onDismiss={() =>
                      setDismissedSpeakers((prev) =>
                        new Set(prev).add(`${s.channel}:${s.speaker_id}`)
                      )
                    }
                  />
                ))}
              </div>
            )}

            <SubtitleOverlay
              messages={messages}
              diarizeEnabled={session.diarize_enabled}
              knownSpeakers={session.participants.map((p) => p.display_name)}
              onReassignSpeaker={
                session.diarize_enabled
                  ? (channel, speakerId, name) => {
                      if (speakerId != null) {
                        assignSpeaker(channel, speakerId, name);
                      }
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
