import { useState, useCallback } from "react";
import type { Session } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL || "";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async (hostName: string, diarizeEnabled = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host_name: hostName, diarize_enabled: diarizeEnabled }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();
      setSession(data);
      return data as Session;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Session not found");
      const data = await res.json();
      setSession(data);
      return data as Session;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const endSession = useCallback(
    async (sessionId?: string) => {
      const id = sessionId || session?.id;
      if (!id) return null;
      setIsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/sessions/${id}/end`, {
          method: "PATCH",
        });
        if (!res.ok) throw new Error("Failed to end session");
        const data = await res.json();
        setSession(data);
        return data as Session;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [session]
  );

  return { session, isLoading, error, createSession, getSession, endSession };
}
