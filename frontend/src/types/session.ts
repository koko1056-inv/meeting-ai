export interface Participant {
  id: number;
  session_id: string;
  role: "host" | "guest";
  channel: "local" | "remote";
  display_name: string;
  speaker_id: string | null;
  joined_at: string;
}

export interface Session {
  id: string;
  host_name: string;
  guest_url: string;
  source_lang: string;
  target_lang: string;
  glossary_id: string | null;
  diarize_enabled: boolean;
  status: string;
  created_at: string;
  ended_at: string | null;
  participants: Participant[];
}

export interface Utterance {
  channel: "local" | "remote";
  speaker_label?: string;
  language: string;
  original_text: string;
  translated_text: string;
  is_final: boolean;
  timestamp: number;
}

export interface GlossaryEntry {
  ja: string;
  vi: string;
  note: string | null;
}
