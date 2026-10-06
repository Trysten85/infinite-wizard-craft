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

export type LedgerReason = "quest" | "discovery" | "learn" | "shop" | "event" | "request" | "gift";

export type PlayerStats = { rep: number; eventPoints: number; lastLevel: number };

// Someone the player has met in an event. Name, role, traits, and facts are fixed once written.
export type Person = {
  id: number;
  name: string;
  role: string;
  traits: string[];
  facts: string[];
  fondness: number;
  status: "active" | "settled" | "dormant";
  firstDay: number;
  lastDay: number;
  // A pending follow-up, and the earliest day it should come up.
  flag: string | null;
  flagDay: number | null;
};

export type StoredEvent = {
  id: number;
  day: number;
  seedId: string;
  kind: string;
  mood: string[];
  personId: number;
  stakes: string;
  // Everything the writer produced, plus the plan code made. Never sent back to the model whole.
  payload: unknown;
  state: "pending" | "resolved";
  chosen: string | null;
  effects: unknown;
  sceneSummary: string;
  outcomeSummary: string | null;
};

export type StoredRequest = { id: number; personId: number; eventId: number; entryId: string; ask: string; gold: number; state: "open" | "done" };
export type StockedSlot = { slot: number; entryId: string; type: "random" | "tailored"; reason: string; sold: boolean };

export type Store = ReturnType<typeof openStore>;

// One SQLite file holds the shared combo cache, each player's discoveries, gold, learned spells
// and shop shelf, and the model call log.
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
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (player, reason, ref)
    );
    CREATE TABLE IF NOT EXISTS learned (
      player TEXT NOT NULL,
      spell_id TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player, spell_id)
    );
    CREATE TABLE IF NOT EXISTS shop_stock (
      player TEXT NOT NULL,
      slot INTEGER NOT NULL,
      entry_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      sold INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player, slot)
    );
    CREATE TABLE IF NOT EXISTS shop_state (
      player TEXT PRIMARY KEY,
      stocked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shop_prices (
      player TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      price INTEGER NOT NULL,
      PRIMARY KEY (player, entry_id)
    );
    CREATE TABLE IF NOT EXISTS player_stats (
      player TEXT PRIMARY KEY,
      rep INTEGER NOT NULL DEFAULT 0,
      event_points INTEGER NOT NULL DEFAULT 0,
      last_level INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      traits TEXT NOT NULL,
      facts TEXT NOT NULL,
      fondness INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      first_day INTEGER NOT NULL,
      last_day INTEGER NOT NULL,
      flag TEXT,
      flag_day INTEGER,
      UNIQUE (player, name)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      day INTEGER NOT NULL,
      seed_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      mood TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      stakes TEXT NOT NULL,
      payload TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      chosen TEXT,
      effects TEXT,
      scene_summary TEXT NOT NULL,
      outcome_summary TEXT,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      entry_id TEXT NOT NULL,
      ask TEXT NOT NULL,
      gold INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS hints (
      player TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      recipe TEXT NOT NULL,
      from_name TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    // Records gold gained or spent. Each (reason, ref) pays a player once, so awards are safe to repeat.
    // Returns true if the row was new.
    addLedger(player: string, amount: number, reason: LedgerReason, ref: string): boolean {
      const result = db
        .prepare("INSERT OR IGNORE INTO ledger (player, amount, reason, ref) VALUES (?, ?, ?, ?)")
        .run(player, amount, reason, ref);
      return result.changes === 1;
    },

    getGold(player: string): number {
      const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS gold FROM ledger WHERE player = ?").get(player);
      return row!.gold as number;
    },

    // The refs a player has ledger rows for under one reason: quests done, things bought, and so on.
    getLedgerRefs(player: string, reason: LedgerReason): string[] {
      return db
        .prepare("SELECT ref FROM ledger WHERE player = ? AND reason = ? ORDER BY id")
        .all(player, reason)
        .map((row) => row.ref as string);
    },

    getLearned(player: string): string[] {
      return db
        .prepare("SELECT spell_id FROM learned WHERE player = ? ORDER BY at, rowid")
        .all(player)
        .map((row) => row.spell_id as string);
    },

    addLearned(player: string, spellId: string): boolean {
      const result = db.prepare("INSERT OR IGNORE INTO learned (player, spell_id) VALUES (?, ?)").run(player, spellId);
      return result.changes === 1;
    },

    // The player's shelf, and how many combined discoveries they had when it was stocked.
    getShop(player: string): { stockedAt: number; slots: StockedSlot[] } | undefined {
      const state = db.prepare("SELECT stocked_at FROM shop_state WHERE player = ?").get(player);
      if (!state) return undefined;
      const slots = db
        .prepare("SELECT slot, entry_id, type, reason, sold FROM shop_stock WHERE player = ? ORDER BY slot")
        .all(player)
        .map((row) => ({
          slot: row.slot as number,
          entryId: row.entry_id as string,
          type: row.type as StockedSlot["type"],
          reason: row.reason as string,
          sold: row.sold === 1,
        }));
      return { stockedAt: state.stocked_at as number, slots };
    },

    setShop(player: string, stockedAt: number, slots: Omit<StockedSlot, "sold">[]): void {
      transaction(() => {
        db.prepare("DELETE FROM shop_stock WHERE player = ?").run(player);
        db.prepare("INSERT OR REPLACE INTO shop_state (player, stocked_at) VALUES (?, ?)").run(player, stockedAt);
        const insert = db.prepare("INSERT INTO shop_stock (player, slot, entry_id, type, reason) VALUES (?, ?, ?, ?, ?)");
        for (const slot of slots) insert.run(player, slot.slot, slot.entryId, slot.type, slot.reason);
      });
    },

    markSold(player: string, slot: number): void {
      db.prepare("UPDATE shop_stock SET sold = 1 WHERE player = ? AND slot = ?").run(player, slot);
    },

    // The price a player was first shown for an entry. It never changes after that.
    getPrice(player: string, entryId: string): number | undefined {
      const row = db.prepare("SELECT price FROM shop_prices WHERE player = ? AND entry_id = ?").get(player, entryId);
      return row?.price as number | undefined;
    },

    setPrice(player: string, entryId: string, price: number): void {
      db.prepare("INSERT OR IGNORE INTO shop_prices (player, entry_id, price) VALUES (?, ?, ?)").run(player, entryId, price);
    },

    getStats(player: string): PlayerStats {
      const row = db.prepare("SELECT rep, event_points, last_level FROM player_stats WHERE player = ?").get(player);
      return row
        ? { rep: row.rep as number, eventPoints: row.event_points as number, lastLevel: row.last_level as number }
        : { rep: 0, eventPoints: 0, lastLevel: 1 };
    },

    // Adds to a player's running totals. `lastLevel` is set outright when given.
    changeStats(player: string, change: { rep?: number; eventPoints?: number; lastLevel?: number }): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare(
        "UPDATE player_stats SET rep = rep + ?, event_points = event_points + ?, last_level = COALESCE(?, last_level) WHERE player = ?",
      ).run(change.rep ?? 0, change.eventPoints ?? 0, change.lastLevel ?? null, player);
    },

    addPerson(player: string, person: Pick<Person, "name" | "role" | "traits" | "facts">, day: number): Person {
      const result = db
        .prepare("INSERT INTO people (player, name, role, traits, facts, first_day, last_day) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(player, person.name, person.role, JSON.stringify(person.traits), JSON.stringify(person.facts), day, day);
      return { ...person, id: Number(result.lastInsertRowid), fondness: 0, status: "active", firstDay: day, lastDay: day, flag: null, flagDay: null };
    },

    listPeople(player: string): Person[] {
      return db
        .prepare("SELECT * FROM people WHERE player = ? ORDER BY id")
        .all(player)
        .map((row) => ({
          id: row.id as number,
          name: row.name as string,
          role: row.role as string,
          traits: JSON.parse(row.traits as string) as string[],
          facts: JSON.parse(row.facts as string) as string[],
          fondness: row.fondness as number,
          status: row.status as Person["status"],
          firstDay: row.first_day as number,
          lastDay: row.last_day as number,
          flag: (row.flag as string | null) ?? null,
          flagDay: (row.flag_day as number | null) ?? null,
        }));
    },

    // Code owns these fields. `flag: null` clears a follow-up.
    updatePerson(id: number, change: { fondness?: number; status?: Person["status"]; lastDay?: number; flag?: string | null; flagDay?: number | null }): void {
      const row = db.prepare("SELECT fondness, status, last_day, flag, flag_day FROM people WHERE id = ?").get(id);
      if (!row) return;
      db.prepare("UPDATE people SET fondness = ?, status = ?, last_day = ?, flag = ?, flag_day = ? WHERE id = ?").run(
        change.fondness ?? (row.fondness as number),
        change.status ?? (row.status as string),
        change.lastDay ?? (row.last_day as number),
        change.flag === undefined ? (row.flag as string | null) : change.flag,
        change.flag === undefined ? (row.flag_day as number | null) : (change.flagDay ?? null),
        id,
      );
    },

    deletePerson(id: number): void {
      db.prepare("DELETE FROM people WHERE id = ?").run(id);
    },

    addEvent(player: string, event: Omit<StoredEvent, "id" | "state" | "chosen" | "effects" | "outcomeSummary">): number {
      const result = db
        .prepare(
          `INSERT INTO events (player, day, seed_id, kind, mood, person_id, stakes, payload, scene_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(player, event.day, event.seedId, event.kind, JSON.stringify(event.mood), event.personId, event.stakes, JSON.stringify(event.payload), event.sceneSummary);
      return Number(result.lastInsertRowid);
    },

    // Every event for a player, oldest first.
    listEvents(player: string): StoredEvent[] {
      return db
        .prepare("SELECT * FROM events WHERE player = ? ORDER BY id")
        .all(player)
        .map((row) => ({
          id: row.id as number,
          day: row.day as number,
          seedId: row.seed_id as string,
          kind: row.kind as string,
          mood: JSON.parse(row.mood as string) as string[],
          personId: row.person_id as number,
          stakes: row.stakes as string,
          payload: JSON.parse(row.payload as string) as unknown,
          state: row.state as StoredEvent["state"],
          chosen: (row.chosen as string | null) ?? null,
          effects: row.effects ? (JSON.parse(row.effects as string) as unknown) : null,
          sceneSummary: row.scene_summary as string,
          outcomeSummary: (row.outcome_summary as string | null) ?? null,
        }));
    },

    // Replaces what is stored for an event still in progress, as its conversation moves on.
    updateEvent(id: number, payload: unknown, sceneSummary: string): void {
      db.prepare("UPDATE events SET payload = ?, scene_summary = ? WHERE id = ?").run(JSON.stringify(payload), sceneSummary, id);
    },

    addHint(player: string, entryId: string, recipe: string, fromName: string): void {
      db.prepare("INSERT OR IGNORE INTO hints (player, entry_id, recipe, from_name) VALUES (?, ?, ?, ?)").run(player, entryId, recipe, fromName);
    },

    listHints(player: string): { entryId: string; recipe: string; fromName: string }[] {
      return db
        .prepare("SELECT entry_id, recipe, from_name FROM hints WHERE player = ? ORDER BY at, rowid")
        .all(player)
        .map((row) => ({ entryId: row.entry_id as string, recipe: row.recipe as string, fromName: row.from_name as string }));
    },

    resolveEvent(id: number, chosen: string, effects: unknown, outcomeSummary: string): void {
      db.prepare("UPDATE events SET state = 'resolved', chosen = ?, effects = ?, outcome_summary = ? WHERE id = ?").run(
        chosen,
        JSON.stringify(effects),
        outcomeSummary,
        id,
      );
    },

    deleteEvent(id: number): void {
      db.prepare("DELETE FROM events WHERE id = ?").run(id);
    },

    addRequest(player: string, request: Omit<StoredRequest, "id" | "state">): number {
      const result = db
        .prepare("INSERT INTO requests (player, person_id, event_id, entry_id, ask, gold) VALUES (?, ?, ?, ?, ?, ?)")
        .run(player, request.personId, request.eventId, request.entryId, request.ask, request.gold);
      return Number(result.lastInsertRowid);
    },

    listRequests(player: string): StoredRequest[] {
      return db
        .prepare("SELECT * FROM requests WHERE player = ? ORDER BY id")
        .all(player)
        .map((row) => ({
          id: row.id as number,
          personId: row.person_id as number,
          eventId: row.event_id as number,
          entryId: row.entry_id as string,
          ask: row.ask as string,
          gold: row.gold as number,
          state: row.state as StoredRequest["state"],
        }));
    },

    finishRequest(id: number): void {
      db.prepare("UPDATE requests SET state = 'done' WHERE id = ?").run(id);
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
