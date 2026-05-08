export interface TranslationMessage {
  channel: "local" | "remote";
  lang: string;
  original: string;
  translated: string;
  is_final: boolean;
  timestamp: number;
  speaker_name?: string;
  speaker_role?: "host" | "guest";
  speaker_id?: number | null;
  speaker_unresolved?: boolean;
}

export interface NewSpeakerDetected {
  type: "new_speaker_detected";
  channel: string;
  speaker_id: number;
  speaker_name: string;
  first_utterance: string;
  timestamp: number;
  suggested_names: string[];
}

export interface SpeakerAssigned {
  type: "speaker_assigned";
  channel: string;
  speaker_id: number;
  display_name: string;
}

export interface WSControlMessage {
  type: string;
  session_id?: string;
  message?: string;
}
