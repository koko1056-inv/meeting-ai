from dataclasses import dataclass

from pydantic import BaseModel


class SessionCreate(BaseModel):
    host_name: str
    source_lang: str = "ja"
    target_lang: str = "vi"
    diarize_enabled: bool = False


class ParticipantCreate(BaseModel):
    display_name: str


class ParticipantResponse(BaseModel):
    id: int
    session_id: str
    role: str
    channel: str
    display_name: str
    speaker_id: str | None = None
    joined_at: str


class SpeakerMappingResponse(BaseModel):
    id: int
    session_id: str
    channel: str
    dg_speaker_id: int
    display_name: str | None
    first_seen_at: float
    utterance_count: int


class SessionResponse(BaseModel):
    id: str
    host_name: str
    guest_url: str
    source_lang: str
    target_lang: str
    glossary_id: str | None = None
    diarize_enabled: bool = False
    status: str
    created_at: str
    ended_at: str | None = None
    participants: list[ParticipantResponse] = []


class UtteranceResponse(BaseModel):
    channel: str
    speaker_label: str | None = None
    language: str
    original_text: str
    translated_text: str
    is_final: bool
    timestamp: float


@dataclass
class TranscriptResult:
    channel: str
    detected_lang: str
    text: str
    is_final: bool
    speaker_id: int | None = None
