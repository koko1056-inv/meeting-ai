import os

import aiosqlite

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/meeting.db")


async def get_db():
    os.makedirs(os.path.dirname(DATABASE_PATH) or ".", exist_ok=True)
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    os.makedirs(os.path.dirname(DATABASE_PATH) or ".", exist_ok=True)
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                host_name TEXT NOT NULL,
                guest_url TEXT NOT NULL,
                source_lang TEXT DEFAULT 'ja',
                target_lang TEXT DEFAULT 'vi',
                glossary_id TEXT,
                diarize_enabled BOOLEAN DEFAULT FALSE,
                status TEXT DEFAULT 'waiting',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS utterances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                speaker_label TEXT,
                dg_speaker_id INTEGER,
                language TEXT NOT NULL,
                original_text TEXT NOT NULL,
                translated_text TEXT NOT NULL,
                is_final BOOLEAN DEFAULT FALSE,
                timestamp REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                channel TEXT NOT NULL,
                display_name TEXT NOT NULL,
                speaker_id TEXT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS speaker_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                dg_speaker_id INTEGER NOT NULL,
                display_name TEXT,
                first_seen_at REAL NOT NULL,
                utterance_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id),
                UNIQUE(session_id, channel, dg_speaker_id)
            );

            CREATE TABLE IF NOT EXISTS glossary_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                ja TEXT NOT NULL,
                vi TEXT NOT NULL,
                note TEXT,
                source TEXT DEFAULT 'manual',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
