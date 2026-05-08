from pydantic import BaseModel


class GlossaryEntry(BaseModel):
    ja: str
    vi: str
    note: str | None = None


class GlossaryUploadResponse(BaseModel):
    count: int
    entries: list[GlossaryEntry]
