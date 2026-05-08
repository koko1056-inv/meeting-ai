import { useState, useRef, useCallback, useEffect } from "react";
import type { TranslationMessage, NewSpeakerDetected } from "../types/websocket";

type Role = "host" | "guest";

export function useTranslationWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<TranslationMessage[]>([]);
  const [unresolvedSpeakers, setUnresolvedSpeakers] = useState<NewSpeakerDetected[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const sessionIdRef = useRef<string>("");
  const roleRef = useRef<Role>("host");

  const connect = useCallback((sessionId: string, role: Role = "host") => {
    sessionIdRef.current = sessionId;
    roleRef.current = role;
    reconnectCountRef.current = 0;

    const wsUrl =
      (import.meta.env.VITE_WS_URL || `ws://${window.location.host}`) +
      `/ws/session/${sessionId}/${role}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected" || data.type === "pong") return;
        if (data.type === "error") {
          console.error("WS error:", data.message);
          return;
        }

        // 新しい話者検出
        if (data.type === "new_speaker_detected") {
          setUnresolvedSpeakers((prev) => [...prev, data as NewSpeakerDetected]);
          return;
        }

        // 話者割当完了 - 過去メッセージの speaker_name を遡及更新
        if (data.type === "speaker_assigned") {
          setMessages((prev) =>
            prev.map((m) =>
              m.channel === data.channel && m.speaker_id === data.speaker_id
                ? { ...m, speaker_name: data.display_name, speaker_unresolved: false }
                : m
            )
          );
          setUnresolvedSpeakers((prev) =>
            prev.filter(
              (s) => !(s.channel === data.channel && s.speaker_id === data.speaker_id)
            )
          );
          return;
        }

        // 翻訳メッセージ
        const msg: TranslationMessage = {
          channel: data.channel,
          lang: data.lang,
          original: data.original,
          translated: data.translated,
          is_final: data.is_final,
          timestamp: data.timestamp,
          speaker_name: data.speaker_name,
          speaker_role: data.speaker_role,
          speaker_id: data.speaker_id ?? null,
          speaker_unresolved: data.speaker_unresolved ?? false,
        };

        setMessages((prev) => {
          // interim の上書きキーに speaker_id も含める
          const matchKey = (m: TranslationMessage) =>
            m.channel === msg.channel &&
            (msg.speaker_id != null ? m.speaker_id === msg.speaker_id : true);

          if (!msg.is_final) {
            const lastIdx = prev.findLastIndex((m) => matchKey(m) && !m.is_final);
            if (lastIdx >= 0) {
              const updated = [...prev];
              updated[lastIdx] = msg;
              return updated;
            }
            return [...prev, msg];
          }
          const lastInterimIdx = prev.findLastIndex((m) => matchKey(m) && !m.is_final);
          if (lastInterimIdx >= 0) {
            const updated = [...prev];
            updated[lastInterimIdx] = msg;
            return updated;
          }
          return [...prev, msg];
        });
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectCountRef.current < 5) {
        reconnectCountRef.current++;
        setTimeout(() => connect(sessionIdRef.current, roleRef.current), 2000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  const disconnect = useCallback(() => {
    reconnectCountRef.current = 999;
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const sendAudio = useCallback((buffer: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(buffer);
    }
  }, []);

  const assignSpeaker = useCallback(
    (channel: string, speakerId: number, displayName: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "assign_speaker",
            channel,
            speaker_id: speakerId,
            display_name: displayName,
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      reconnectCountRef.current = 999;
      wsRef.current?.close();
    };
  }, []);

  return {
    isConnected,
    messages,
    unresolvedSpeakers,
    connect,
    disconnect,
    sendAudio,
    assignSpeaker,
  };
}
