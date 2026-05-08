import { useState, useRef, useCallback } from "react";

const CHANNEL_BYTE_LOCAL = 0x00;
const CHANNEL_BYTE_REMOTE = 0x01;

export type CaptureStatus =
  | "idle"
  | "requesting_mic"
  | "requesting_screen"
  | "active"
  | "error";

interface AudioCaptureState {
  status: CaptureStatus;
  errorMessage: string | null;
  localAudioLevel: number;
  remoteAudioLevel: number;
}

export function useAudioCapture(sendAudio: (buffer: ArrayBuffer) => void) {
  const [state, setState] = useState<AudioCaptureState>({
    status: "idle",
    errorMessage: null,
    localAudioLevel: 0,
    remoteAudioLevel: 0,
  });

  const localCtxRef = useRef<AudioContext | null>(null);
  const remoteCtxRef = useRef<AudioContext | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const buildPipeline = useCallback(
    async (
      stream: MediaStream,
      channelByte: number
    ): Promise<{ ctx: AudioContext; analyser: AnalyserNode }> => {
      const ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.audioWorklet.addModule("/audio-processor.js");

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const worklet = new AudioWorkletNode(ctx, "pcm-processor");
      source.connect(worklet);

      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        const pcm = new Uint8Array(e.data);
        const combined = new Uint8Array(1 + pcm.byteLength);
        combined[0] = channelByte;
        combined.set(pcm, 1);
        sendAudio(combined.buffer);
      };

      return { ctx, analyser };
    },
    [sendAudio]
  );

  const startLevelMonitor = useCallback(() => {
    const update = () => {
      const getLevel = (analyser: AnalyserNode | null): number => {
        if (!analyser) return 0;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        return avg / 255;
      };

      setState((s) => ({
        ...s,
        localAudioLevel: getLevel(localAnalyserRef.current),
        remoteAudioLevel: getLevel(remoteAnalyserRef.current),
      }));
      animFrameRef.current = requestAnimationFrame(update);
    };
    cancelAnimationFrame(animFrameRef.current);
    update();
  }, []);

  const startAll = useCallback(async () => {
    setState((s) => ({ ...s, status: "requesting_mic", errorMessage: null }));

    // Step 1: マイク取得
    let localStream: MediaStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      localStreamRef.current = localStream;
      const { ctx, analyser } = await buildPipeline(localStream, CHANNEL_BYTE_LOCAL);
      localCtxRef.current = ctx;
      localAnalyserRef.current = analyser;
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "マイクの使用が許可されませんでした。ブラウザの設定を確認してください。"
          : "マイクの取得に失敗しました。";
      setState((s) => ({ ...s, status: "error", errorMessage: msg }));
      return;
    }

    // Step 2: 画面音声取得
    setState((s) => ({ ...s, status: "requesting_screen" }));
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1 },
      });

      // ビデオトラックを即停止
      displayStream.getVideoTracks().forEach((t) => t.stop());

      if (displayStream.getAudioTracks().length === 0) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage:
            "画面の音声が取得できませんでした。共有ダイアログで「音声を共有」にチェックを入れてください。",
        }));
        return;
      }

      remoteStreamRef.current = displayStream;
      const { ctx, analyser } = await buildPipeline(displayStream, CHANNEL_BYTE_REMOTE);
      remoteCtxRef.current = ctx;
      remoteAnalyserRef.current = analyser;

      // 画面共有が停止された場合のハンドリング
      displayStream.getAudioTracks()[0].onended = () => {
        stopAll();
      };
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "画面共有がキャンセルされました。翻訳を開始するには画面共有が必要です。"
          : "画面音声の取得に失敗しました。";
      // マイクは取得済みなので解放
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localCtxRef.current?.close();
      localStreamRef.current = null;
      localCtxRef.current = null;
      localAnalyserRef.current = null;
      setState((s) => ({ ...s, status: "error", errorMessage: msg }));
      return;
    }

    // 両方取得成功
    setState((s) => ({ ...s, status: "active" }));
    startLevelMonitor();
  }, [buildPipeline, startLevelMonitor]);

  const stopAll = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    localCtxRef.current?.close();
    remoteCtxRef.current?.close();
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    localCtxRef.current = null;
    remoteCtxRef.current = null;
    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    setState({
      status: "idle",
      errorMessage: null,
      localAudioLevel: 0,
      remoteAudioLevel: 0,
    });
  }, []);

  return {
    ...state,
    startAll,
    stopAll,
  };
}
