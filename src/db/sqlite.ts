import * as SQLite from "expo-sqlite";

const DB_NAME = "flood-escape.db";

// Versioned schema. Bump USER_VERSION and add a step when the local schema changes.
const USER_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS outbox (
  client_id       TEXT PRIMARY KEY NOT NULL,
  kind            TEXT NOT NULL,
  payload         TEXT NOT NULL,
  photo_uri       TEXT,
  report_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox (status, next_attempt_at);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (once) and migrates the local database used for the offline outbox. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL;");
      const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
      const current = row?.user_version ?? 0;
      if (current < 1) {
        await db.execAsync(SCHEMA_V1);
      }
      if (current < USER_VERSION) {
        await db.execAsync(`PRAGMA user_version = ${USER_VERSION}`);
      }
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
