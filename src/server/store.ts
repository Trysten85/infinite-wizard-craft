import { DatabaseSync } from "node:sqlite";
import type { GameEntry } from "../shared/schema";

export type CachedCombo = { key: string; a: string; b: string; resultId: string; createdAt: string };

export type ModelCall = {
  purpose: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
};

export type Store = ReturnType<typeof openStore>;

// One SQLite file holds the shared combo cache, each player's discoveries, and the model call log.
export function openStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS combos (
      key TEXT PRIMARY KEY,
      a TEXT NOT NULL,
      b TEXT NOT NULL,
      result_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tag_reviews (
      entry_id TEXT PRIMARY KEY,
      suggestion TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discoveries (
      player TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player, entry_id)
    );
    CREATE TABLE IF NOT EXISTS model_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      purpose TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      ok INTEGER NOT NULL,
      error TEXT
    );
  `);

  function transaction<T>(fn: () => T): T {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  function removeCombo(key: string, removedEntries: string[]): void {
    const row = db.prepare("SELECT result_id FROM combos WHERE key = ?").get(key);
    if (!row) return;
    const resultId = row.result_id as string;
    db.prepare("DELETE FROM combos WHERE key = ?").run(key);

    const stillMade = db.prepare("SELECT 1 FROM combos WHERE result_id = ? LIMIT 1").get(resultId);
    if (stillMade) return;
    // Nothing makes this entry any more, so it goes too, along with everything built from it.
    const deleted = db.prepare("DELETE FROM entries WHERE id = ?").run(resultId);
    if (deleted.changes === 0) return;
    removedEntries.push(resultId);
    db.prepare("DELETE FROM discoveries WHERE entry_id = ?").run(resultId);
    db.prepare("DELETE FROM tag_reviews WHERE entry_id = ?").run(resultId);
    const dependents = db.prepare("SELECT key FROM combos WHERE a = ? OR b = ?").all(resultId, resultId);
    for (const dependent of dependents) removeCombo(dependent.key as string, removedEntries);
  }

  return {
    getCombo(key: string): string | undefined {
      const row = db.prepare("SELECT result_id FROM combos WHERE key = ?").get(key);
      return row?.result_id as string | undefined;
    },

    getEntry(id: string): GameEntry | undefined {
      const row = db.prepare("SELECT json FROM entries WHERE id = ?").get(id);
      return row ? (JSON.parse(row.json as string) as GameEntry) : undefined;
    },

    // Saves a generated combo. An existing entry with the same id is kept, so its text never changes.
    // `missingTag` is the model's hint that the vocabulary lacked a word; it is kept for human review.
    saveGenerated(key: string, a: string, b: string, entry: GameEntry, missingTag?: string | null): void {
      transaction(() => {
        const inserted = db
          .prepare("INSERT OR IGNORE INTO entries (id, json) VALUES (?, ?)")
          .run(entry.id, JSON.stringify(entry));
        if (inserted.changes === 1 && missingTag) {
          db.prepare("INSERT INTO tag_reviews (entry_id, suggestion) VALUES (?, ?)").run(entry.id, missingTag);
        }
        db.prepare("INSERT INTO combos (key, a, b, result_id) VALUES (?, ?, ?, ?)").run(key, a, b, entry.id);
      });
    },

    listEntries(): GameEntry[] {
      return db
        .prepare("SELECT json FROM entries ORDER BY rowid")
        .all()
        .map((row) => JSON.parse(row.json as string) as GameEntry);
    },

    getTagSuggestion(entryId: string): string | undefined {
      const row = db.prepare("SELECT suggestion FROM tag_reviews WHERE entry_id = ?").get(entryId);
      return row?.suggestion as string | undefined;
    },

    // Replaces a generated entry's description, for when the voice guide changes. The name stays.
    setEntryDescription(id: string, description: string): boolean {
      const row = db.prepare("SELECT json FROM entries WHERE id = ?").get(id);
      if (!row) return false;
      const entry = { ...(JSON.parse(row.json as string) as GameEntry), description };
      db.prepare("UPDATE entries SET json = ? WHERE id = ?").run(JSON.stringify(entry), id);
      return true;
    },

    // Replaces a generated entry's tags after human review. Returns false if there is no such entry.
    setEntryTags(id: string, tags: string[]): boolean {
      const row = db.prepare("SELECT json FROM entries WHERE id = ?").get(id);
      if (!row) return false;
      const entry = { ...(JSON.parse(row.json as string) as GameEntry), tags };
      transaction(() => {
        db.prepare("UPDATE entries SET json = ? WHERE id = ?").run(JSON.stringify(entry), id);
        db.prepare("DELETE FROM tag_reviews WHERE entry_id = ?").run(id);
      });
      return true;
    },

    listCombos(): CachedCombo[] {
      return db
        .prepare("SELECT key, a, b, result_id, created_at FROM combos ORDER BY created_at, key")
        .all()
        .map((row) => ({
          key: row.key as string,
          a: row.a as string,
          b: row.b as string,
          resultId: row.result_id as string,
          createdAt: row.created_at as string,
        }));
    },

    // Deletes a cached combo. Returns the ids of generated entries that were removed with it.
    deleteCombo(key: string): string[] {
      const removedEntries: string[] = [];
      transaction(() => removeCombo(key, removedEntries));
      return removedEntries;
    },

    getDiscoveries(player: string): string[] {
      return db
        .prepare("SELECT entry_id FROM discoveries WHERE player = ? ORDER BY discovered_at, rowid")
        .all(player)
        .map((row) => row.entry_id as string);
    },

    // Returns true the first time this player discovers the entry.
    addDiscovery(player: string, entryId: string): boolean {
      const result = db
        .prepare("INSERT OR IGNORE INTO discoveries (player, entry_id) VALUES (?, ?)")
        .run(player, entryId);
      return result.changes === 1;
    },

    logModelCall(call: ModelCall): void {
      db.prepare(
        `INSERT INTO model_calls (purpose, model, prompt_tokens, completion_tokens, latency_ms, ok, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        call.purpose,
        call.model,
        call.promptTokens,
        call.completionTokens,
        Math.round(call.latencyMs),
        call.ok ? 1 : 0,
        call.error ?? null,
      );
    },

    listModelCalls(limit: number): (ModelCall & { at: string })[] {
      return db
        .prepare("SELECT * FROM model_calls ORDER BY id DESC LIMIT ?")
        .all(limit)
        .map((row) => ({
          at: row.at as string,
          purpose: row.purpose as string,
          model: row.model as string,
          promptTokens: row.prompt_tokens as number,
          completionTokens: row.completion_tokens as number,
          latencyMs: row.latency_ms as number,
          ok: row.ok === 1,
          error: (row.error as string | null) ?? undefined,
        }));
    },

    close(): void {
      db.close();
    },
  };
}
