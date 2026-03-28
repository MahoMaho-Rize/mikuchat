// SQLite local storage for QQ sessions and messages
import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";
import type { QCSession, QCMessage, OB11Segment } from "./types";

const DATA_DIR = path.join(
  process.env.HOME || "/tmp",
  ".local",
  "share",
  "mikuchat",
);
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "qc.db");

let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      last_message TEXT,
      last_message_time INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      card TEXT,
      role TEXT,
      segments TEXT NOT NULL DEFAULT '[]',
      raw_message TEXT NOT NULL DEFAULT '',
      time INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_time
      ON messages(session_id, time);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id
      ON messages(message_id);
  `);
}

// === Session operations ===

export function upsertSession(
  s: Omit<QCSession, "unread_count" | "pinned"> & { unread_count?: number },
): void {
  const db = getDb();
  db.run(
    `INSERT INTO sessions (id, type, target_id, name, avatar_url, last_message, last_message_time, unread_count, pinned)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(?4, name),
       avatar_url = COALESCE(?5, avatar_url),
       last_message = ?6,
       last_message_time = MAX(last_message_time, ?7),
       unread_count = unread_count + COALESCE(?8, 1)`,
    [
      s.id,
      s.type,
      s.target_id,
      s.name,
      s.avatar_url ?? null,
      s.last_message ?? null,
      s.last_message_time,
      s.unread_count ?? 1,
    ],
  );
}

export function getSessions(opts?: {
  onlyActive?: boolean;
  limit?: number;
}): QCSession[] {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  if (opts?.onlyActive) {
    return db
      .query(
        `SELECT * FROM sessions WHERE unread_count > 0 OR pinned = 1
         ORDER BY pinned DESC, last_message_time DESC LIMIT ?`,
      )
      .all(limit) as QCSession[];
  }
  return db
    .query(
      `SELECT * FROM sessions ORDER BY pinned DESC, last_message_time DESC LIMIT ?`,
    )
    .all(limit) as QCSession[];
}

export function searchSessions(query: string, limit = 20): QCSession[] {
  const db = getDb();
  return db
    .query(
      `SELECT * FROM sessions
       WHERE name LIKE ?1
          OR CAST(target_id AS TEXT) LIKE ?1
          OR id LIKE ?1
       ORDER BY last_message_time DESC LIMIT ?2`,
    )
    .all(`%${query}%`, limit) as QCSession[];
}

export function markRead(sessionId: string): void {
  const db = getDb();
  db.run(`UPDATE sessions SET unread_count = 0 WHERE id = ?`, [sessionId]);
}

export function pinSession(sessionId: string, pinned: boolean): void {
  const db = getDb();
  db.run(`UPDATE sessions SET pinned = ? WHERE id = ?`, [
    pinned ? 1 : 0,
    sessionId,
  ]);
}

// === Message operations ===

export function insertMessage(m: Omit<QCMessage, "id">): void {
  const db = getDb();
  db.run(
    `INSERT OR IGNORE INTO messages (session_id, message_id, user_id, nickname, card, role, segments, raw_message, time)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [
      m.session_id,
      m.message_id,
      m.user_id,
      m.nickname,
      m.card ?? null,
      m.role ?? null,
      JSON.stringify(m.segments),
      m.raw_message,
      m.time,
    ],
  );
}

export function getMessages(
  sessionId: string,
  opts?: { before?: number; beforeId?: number; limit?: number },
): QCMessage[] {
  const db = getDb();
  const limit = opts?.limit ?? 100;
  let rows: any[];
  if (opts?.before) {
    // Use (time, id) for stable pagination — avoids skipping messages with same timestamp
    rows = db
      .query(
        `SELECT * FROM messages WHERE session_id = ?1 AND (time < ?2 OR (time = ?2 AND id < ?3))
         ORDER BY time DESC, id DESC LIMIT ?4`,
      )
      .all(sessionId, opts.before, opts.beforeId ?? 0, limit);
  } else {
    rows = db
      .query(
        `SELECT * FROM messages WHERE session_id = ?1 ORDER BY time DESC, id DESC LIMIT ?2`,
      )
      .all(sessionId, limit);
  }
  // Parse segments JSON and return in chronological order
  return rows
    .map((r: any) => ({
      ...r,
      segments: JSON.parse(r.segments) as OB11Segment[],
    }))
    .reverse();
}

export function getLatestMessageTime(sessionId: string): number {
  const db = getDb();
  const row = db
    .query(`SELECT MAX(time) as t FROM messages WHERE session_id = ?`)
    .get(sessionId) as any;
  return row?.t ?? 0;
}
