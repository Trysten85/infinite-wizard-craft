import { DatabaseSync } from "node:sqlite";
import { firstDay, type DayState } from "../shared/day";
import type { GameEntry, Ledger } from "../shared/schema";

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

// "perk" is the extra a building pays for a discovery of its kind. "plot" and "building" are
// gold spent on the town, and "takings" what the town pays back at night.
export type LedgerReason = "quest" | "discovery" | "learn" | "shop" | "event" | "request" | "gift" | "shift" | "perk" | "plot" | "building" | "takings" | "meal";

// `bonusXp` makes up the difference when a change to the game's numbers would otherwise have
// taken away a level the player had already reached.
// `job` is the job the player has taken up, or null if they have not chosen one.
export type PlayerStats = { rep: number; lastLevel: number; bonusXp: number; job: string | null };

// Where a player is in their day, and what is kept beside it.
export type SavedDay = {
  state: DayState;
  // The player's level when this day began. A level gained since then earns a deed at night.
  dawnLevel: number;
  // The last day on which the player finished with a visitor, or 0. There is one visitor a day.
  visitorDay: number;
  // Last night's ledger, kept until the next night.
  lastLedger: Ledger | null;
  // The day a Great or Perfect shift was last worked, or 0. It lifts the player's own building
  // that night.
  shiftLiftDay: number;
};

// A spell cast on a building. `daysLeft` counts the nights it still has, tonight included.
export type StoredEnchantment = { plot: number; spellId: string; spellName: string; tier: number; daysLeft: number };

// A meal eaten at the Tavern: tomorrow's discoveries pay `lift` more.
export type StoredMeal = { day: number; lift: number };

// A one-night happening a day carried, if any, and whether the player took part.
export type StoredTonight = { day: number; happening: string | null; taken: boolean };

// One thing on one shelf of a building. A discovery is on one shelf at a time.
export type StoredStock = { plot: number; slot: number; entryId: string };

// An order on a player's board, for one job. It stays until it is filled.
export type StoredShiftOrder = { id: number; job: string; tags: string[]; tier: number; text: string; state: "open" | "done" };
// One shift worked, for the log.
export type StoredShift = {
  id: number;
  job: string;
  orderTags: string[];
  // The ids chosen for the base, the method, and the touch if there was one.
  inputs: string[];
  quality: string;
  line: string;
  gold: number;
  xp: number;
  rep: number;
};

export type Pronoun = "she" | "he" | "they";

// Someone the player knows: met in an event, or a townsperson who arrived with their job.
// Name, pronoun, role, traits, and facts are fixed once written.
export type Person = {
  id: number;
  name: string;
  // The job a townsperson came with. Null for someone met in an event.
  job: string | null;
  // Null for someone met before pronouns were recorded.
  pronoun: Pronoun | null;
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
  // "writing" is an event still being written out of sight. The player cannot see it yet.
  state: "writing" | "pending" | "resolved";
  chosen: string | null;
  effects: unknown;
  sceneSummary: string;
  outcomeSummary: string | null;
};

// A plot the player owns on the street, counted from 0, and what stands on it. `tier` is 0
// while the plot is empty.
export type StoredPlot = { plot: number; building: string | null; tier: number };

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
    CREATE TABLE IF NOT EXISTS shift_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      job TEXT NOT NULL,
      tags TEXT NOT NULL,
      tier INTEGER NOT NULL,
      text TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT NOT NULL,
      job TEXT NOT NULL,
      order_tags TEXT NOT NULL,
      inputs TEXT NOT NULL,
      quality TEXT NOT NULL,
      line TEXT NOT NULL,
      gold INTEGER NOT NULL,
      xp INTEGER NOT NULL,
      rep INTEGER NOT NULL,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS town_plots (
      player TEXT NOT NULL,
      plot INTEGER NOT NULL,
      building TEXT,
      tier INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player, plot)
    );
    CREATE TABLE IF NOT EXISTS town_stock (
      player TEXT NOT NULL,
      plot INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      entry_id TEXT NOT NULL,
      PRIMARY KEY (player, plot, slot),
      UNIQUE (player, entry_id)
    );
    CREATE TABLE IF NOT EXISTS town_hands (
      player TEXT NOT NULL,
      plot INTEGER NOT NULL,
      day INTEGER NOT NULL,
      PRIMARY KEY (player, plot, day)
    );
    CREATE TABLE IF NOT EXISTS town_enchants (
      player TEXT NOT NULL,
      plot INTEGER NOT NULL,
      spell_id TEXT NOT NULL,
      spell_name TEXT NOT NULL,
      tier INTEGER NOT NULL,
      days_left INTEGER NOT NULL,
      PRIMARY KEY (player, plot)
    );
    CREATE TABLE IF NOT EXISTS town_meals (
      player TEXT NOT NULL,
      day INTEGER NOT NULL,
      lift REAL NOT NULL,
      PRIMARY KEY (player, day)
    );
    CREATE TABLE IF NOT EXISTS town_calls (
      player TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      day INTEGER NOT NULL,
      PRIMARY KEY (player, person_id, day)
    );
    CREATE TABLE IF NOT EXISTS town_regulars (
      player TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      PRIMARY KEY (player, person_id)
    );
    CREATE TABLE IF NOT EXISTS town_tonight (
      player TEXT NOT NULL,
      day INTEGER NOT NULL,
      happening TEXT,
      taken INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player, day)
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

  // Columns added since the first saved games were made.
  const personColumns = db.prepare("PRAGMA table_info(people)").all().map((row) => row.name as string);
  if (!personColumns.includes("pronoun")) db.exec("ALTER TABLE people ADD COLUMN pronoun TEXT");
  if (!personColumns.includes("job")) db.exec("ALTER TABLE people ADD COLUMN job TEXT");
  const statColumns = db.prepare("PRAGMA table_info(player_stats)").all().map((row) => row.name as string);
  if (!statColumns.includes("bonus_xp")) db.exec("ALTER TABLE player_stats ADD COLUMN bonus_xp INTEGER NOT NULL DEFAULT 0");
  if (!statColumns.includes("job")) db.exec("ALTER TABLE player_stats ADD COLUMN job TEXT");
  if (!statColumns.includes("shift_at")) db.exec("ALTER TABLE player_stats ADD COLUMN shift_at INTEGER");

  // The day. A save from before there were days opens at dawn on day 1, with the shelf it last
  // saw. What it remembers of earlier days (when each event happened, when each person was last
  // seen, when a follow-up falls due) was counted in events. Those numbers are moved back to end
  // at day 0: their order and the gaps between them are kept, and all of them lie before day 1.
  if (!statColumns.includes("day")) {
    transaction(() => {
      db.exec(`
        ALTER TABLE player_stats ADD COLUMN day INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE player_stats ADD COLUMN sun INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE player_stats ADD COLUMN shift_done INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE player_stats ADD COLUMN early INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE player_stats ADD COLUMN candles_spent INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE player_stats ADD COLUMN oil INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE player_stats ADD COLUMN dawn_level INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE player_stats ADD COLUMN visitor_day INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE player_stats ADD COLUMN last_ledger TEXT;
        UPDATE player_stats SET dawn_level = last_level;
        UPDATE shop_state SET stocked_at = 1;
      `);
      const latest = db
        .prepare("SELECT player, MAX(day) AS day FROM (SELECT player, day FROM events UNION ALL SELECT player, last_day AS day FROM people) GROUP BY player")
        .all();
      for (const row of latest) {
        const [player, back] = [row.player as string, row.day as number];
        db.prepare("UPDATE events SET day = day - ? WHERE player = ?").run(back, player);
        db.prepare("UPDATE people SET first_day = first_day - ?, last_day = last_day - ?, flag_day = flag_day - ? WHERE player = ?").run(back, back, back, player);
      }
    });
  }

  if (!statColumns.includes("enchantments")) db.exec("ALTER TABLE player_stats ADD COLUMN enchantments INTEGER NOT NULL DEFAULT 0");
  if (!statColumns.includes("evenings")) db.exec("ALTER TABLE player_stats ADD COLUMN evenings INTEGER NOT NULL DEFAULT 0");
  if (!statColumns.includes("shift_lift_day")) db.exec("ALTER TABLE player_stats ADD COLUMN shift_lift_day INTEGER NOT NULL DEFAULT 0");

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

    // The first pair that made a generated entry, for telling the model what a thing is.
    getMakers(resultId: string): [string, string] | undefined {
      const row = db.prepare("SELECT a, b FROM combos WHERE result_id = ? ORDER BY created_at, rowid LIMIT 1").get(resultId);
      return row ? [row.a as string, row.b as string] : undefined;
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

    // The player's shelf, and the day it was stocked on.
    getShop(player: string): { stockedDay: number; slots: StockedSlot[] } | undefined {
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
      return { stockedDay: state.stocked_at as number, slots };
    },

    setShop(player: string, stockedDay: number, slots: Omit<StockedSlot, "sold">[]): void {
      transaction(() => {
        db.prepare("DELETE FROM shop_stock WHERE player = ?").run(player);
        db.prepare("INSERT OR REPLACE INTO shop_state (player, stocked_at) VALUES (?, ?)").run(player, stockedDay);
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
      const row = db.prepare("SELECT rep, last_level, bonus_xp, job FROM player_stats WHERE player = ?").get(player);
      return row
        ? { rep: row.rep as number, lastLevel: row.last_level as number, bonusXp: row.bonus_xp as number, job: (row.job as string | null) ?? null }
        : { rep: 0, lastLevel: 1, bonusXp: 0, job: null };
    },

    // Records the job a player has taken up. It stays theirs until they take up another.
    setJob(player: string, jobId: string): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare("UPDATE player_stats SET job = ? WHERE player = ?").run(jobId, player);
    },

    // Adds to a player's running totals. `lastLevel` is set outright when given.
    changeStats(player: string, change: { rep?: number; lastLevel?: number; bonusXp?: number }): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare("UPDATE player_stats SET rep = rep + ?, bonus_xp = bonus_xp + ?, last_level = COALESCE(?, last_level) WHERE player = ?").run(
        change.rep ?? 0,
        change.bonusXp ?? 0,
        change.lastLevel ?? null,
        player,
      );
    },

    // Where the player is in their day. Someone never seen before is at dawn on day 1.
    getDay(player: string): SavedDay {
      const row = db
        .prepare("SELECT day, sun, shift_done, early, candles_spent, oil, dawn_level, visitor_day, last_ledger, shift_lift_day FROM player_stats WHERE player = ?")
        .get(player);
      if (!row) return { state: firstDay(), dawnLevel: 1, visitorDay: 0, lastLedger: null, shiftLiftDay: 0 };
      return {
        state: {
          number: row.day as number,
          sun: row.sun as number,
          shiftDone: row.shift_done === 1,
          early: row.early === 1,
          spent: row.candles_spent as number,
          oil: row.oil as number,
        },
        dawnLevel: row.dawn_level as number,
        visitorDay: row.visitor_day as number,
        lastLedger: row.last_ledger ? (JSON.parse(row.last_ledger as string) as Ledger) : null,
        shiftLiftDay: row.shift_lift_day as number,
      };
    },

    setDay(player: string, state: DayState): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare("UPDATE player_stats SET day = ?, sun = ?, shift_done = ?, early = ?, candles_spent = ?, oil = ? WHERE player = ?").run(
        state.number,
        state.sun,
        state.shiftDone ? 1 : 0,
        state.early ? 1 : 0,
        state.spent,
        state.oil,
        player,
      );
    },

    // Night: keeps the ledger and starts the next day in one step, so that a save is never
    // caught between the two.
    startDay(player: string, state: DayState, dawnLevel: number, ledger: Ledger): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare(
        "UPDATE player_stats SET day = ?, sun = ?, shift_done = ?, early = ?, candles_spent = ?, oil = ?, dawn_level = ?, last_ledger = ? WHERE player = ?",
      ).run(state.number, state.sun, state.shiftDone ? 1 : 0, state.early ? 1 : 0, state.spent, state.oil, dawnLevel, JSON.stringify(ledger), player);
    },

    // How many evening actions the player has ever taken, for the town quests.
    countEvenings(player: string): number {
      const row = db.prepare("SELECT evenings FROM player_stats WHERE player = ?").get(player);
      return (row?.evenings as number | undefined) ?? 0;
    },

    addEvening(player: string): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare("UPDATE player_stats SET evenings = evenings + 1 WHERE player = ?").run(player);
    },

    // Notes the day a Great or Perfect shift was worked.
    setShiftLiftDay(player: string, day: number): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare("UPDATE player_stats SET shift_lift_day = ? WHERE player = ?").run(day, player);
    },

    // Notes the day on which the player finished with a visitor.
    setVisitorDay(player: string, day: number): void {
      db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
      db.prepare("UPDATE player_stats SET visitor_day = ? WHERE player = ?").run(day, player);
    },

    addShiftOrder(player: string, order: Pick<StoredShiftOrder, "job" | "tags" | "tier" | "text">): number {
      const result = db
        .prepare("INSERT INTO shift_orders (player, job, tags, tier, text) VALUES (?, ?, ?, ?, ?)")
        .run(player, order.job, JSON.stringify(order.tags), order.tier, order.text);
      return Number(result.lastInsertRowid);
    },

    // A player's orders for one job that are still waiting to be filled, oldest first.
    listOpenShiftOrders(player: string, job: string): StoredShiftOrder[] {
      return db
        .prepare("SELECT * FROM shift_orders WHERE player = ? AND job = ? AND state = 'open' ORDER BY id")
        .all(player, job)
        .map((row) => ({
          id: row.id as number,
          job: row.job as string,
          tags: JSON.parse(row.tags as string) as string[],
          tier: row.tier as number,
          text: row.text as string,
          state: "open" as const,
        }));
    },

    finishShiftOrder(id: number): void {
      db.prepare("UPDATE shift_orders SET state = 'done' WHERE id = ?").run(id);
    },

    addShift(player: string, shift: Omit<StoredShift, "id">): number {
      const result = db
        .prepare("INSERT INTO shifts (player, job, order_tags, inputs, quality, line, gold, xp, rep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(player, shift.job, JSON.stringify(shift.orderTags), JSON.stringify(shift.inputs), shift.quality, shift.line, shift.gold, shift.xp, shift.rep);
      return Number(result.lastInsertRowid);
    },

    // Every shift a player has worked, oldest first.
    listShifts(player: string): StoredShift[] {
      return db
        .prepare("SELECT * FROM shifts WHERE player = ? ORDER BY id")
        .all(player)
        .map((row) => ({
          id: row.id as number,
          job: row.job as string,
          orderTags: JSON.parse(row.order_tags as string) as string[],
          inputs: JSON.parse(row.inputs as string) as string[],
          quality: row.quality as string,
          line: row.line as string,
          gold: row.gold as number,
          xp: row.xp as number,
          rep: row.rep as number,
        }));
    },

    // How many shifts a player has worked in one job. Rank comes from this.
    countShifts(player: string, job: string): number {
      const row = db.prepare("SELECT COUNT(*) AS n FROM shifts WHERE player = ? AND job = ?").get(player, job);
      return row!.n as number;
    },

    // All the XP a player's shifts have paid.
    getShiftXp(player: string): number {
      const row = db.prepare("SELECT COALESCE(SUM(xp), 0) AS xp FROM shifts WHERE player = ?").get(player);
      return row!.xp as number;
    },

    addPerson(player: string, person: Pick<Person, "name" | "role" | "traits" | "facts"> & { pronoun?: Pronoun | null; job?: string | null }, day: number): Person {
      const pronoun = person.pronoun ?? null;
      const job = person.job ?? null;
      const result = db
        .prepare("INSERT INTO people (player, name, pronoun, job, role, traits, facts, first_day, last_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(player, person.name, pronoun, job, person.role, JSON.stringify(person.traits), JSON.stringify(person.facts), day, day);
      return { ...person, pronoun, job, id: Number(result.lastInsertRowid), fondness: 0, status: "active", firstDay: day, lastDay: day, flag: null, flagDay: null };
    },

    listPeople(player: string): Person[] {
      return db
        .prepare("SELECT * FROM people WHERE player = ? ORDER BY id")
        .all(player)
        .map((row) => ({
          id: row.id as number,
          name: row.name as string,
          job: (row.job as string | null) ?? null,
          pronoun: (row.pronoun as Pronoun | null) ?? null,
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

    addEvent(
      player: string,
      event: Omit<StoredEvent, "id" | "state" | "chosen" | "effects" | "outcomeSummary">,
      state: "writing" | "pending" = "pending",
    ): number {
      const result = db
        .prepare(
          `INSERT INTO events (player, day, seed_id, kind, mood, person_id, stakes, payload, scene_summary, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(player, event.day, event.seedId, event.kind, JSON.stringify(event.mood), event.personId, event.stakes, JSON.stringify(event.payload), event.sceneSummary, state);
      return Number(result.lastInsertRowid);
    },

    // Puts an event that has been written out of sight in front of the player.
    showEvent(id: number): void {
      db.prepare("UPDATE events SET state = 'pending' WHERE id = ? AND state = 'writing'").run(id);
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

    // How many events a player has seen through to the end.
    countResolvedEvents(player: string): number {
      const row = db.prepare("SELECT COUNT(*) AS n FROM events WHERE player = ? AND state = 'resolved'").get(player);
      return row!.n as number;
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

    // The plots a player owns, in order along the street.
    listPlots(player: string): StoredPlot[] {
      return db
        .prepare("SELECT plot, building, tier FROM town_plots WHERE player = ? ORDER BY plot")
        .all(player)
        .map((row) => ({ plot: row.plot as number, building: (row.building as string | null) ?? null, tier: row.tier as number }));
    },

    // Gives the player a plot. Returns false if they already had it.
    addPlot(player: string, plot: number): boolean {
      return db.prepare("INSERT OR IGNORE INTO town_plots (player, plot) VALUES (?, ?)").run(player, plot).changes === 1;
    },

    // What is on each shelf of the player's buildings.
    listStock(player: string): StoredStock[] {
      return db
        .prepare("SELECT plot, slot, entry_id FROM town_stock WHERE player = ? ORDER BY plot, slot")
        .all(player)
        .map((row) => ({ plot: row.plot as number, slot: row.slot as number, entryId: row.entry_id as string }));
    },

    // Puts a discovery on a shelf, or clears the shelf when `entryId` is null. A discovery already
    // on another shelf is moved: it can be in one place at a time. What was on the shelf goes.
    setStock(player: string, plot: number, slot: number, entryId: string | null): void {
      transaction(() => {
        db.prepare("DELETE FROM town_stock WHERE player = ? AND plot = ? AND slot = ?").run(player, plot, slot);
        if (entryId === null) return;
        db.prepare("DELETE FROM town_stock WHERE player = ? AND entry_id = ?").run(player, entryId);
        db.prepare("INSERT INTO town_stock (player, plot, slot, entry_id) VALUES (?, ?, ?, ?)").run(player, plot, slot, entryId);
      });
    },

    // Enchantments standing on the player's buildings.
    listEnchantments(player: string): StoredEnchantment[] {
      return db
        .prepare("SELECT plot, spell_id, spell_name, tier, days_left FROM town_enchants WHERE player = ? ORDER BY plot")
        .all(player)
        .map((row) => ({ plot: row.plot as number, spellId: row.spell_id as string, spellName: row.spell_name as string, tier: row.tier as number, daysLeft: row.days_left as number }));
    },

    // Casts a spell on a building, replacing any enchantment already there, and counts the cast.
    setEnchantment(player: string, enchantment: StoredEnchantment): void {
      transaction(() => {
        db.prepare("INSERT OR REPLACE INTO town_enchants (player, plot, spell_id, spell_name, tier, days_left) VALUES (?, ?, ?, ?, ?, ?)").run(
          player,
          enchantment.plot,
          enchantment.spellId,
          enchantment.spellName,
          enchantment.tier,
          enchantment.daysLeft,
        );
        db.prepare("INSERT OR IGNORE INTO player_stats (player) VALUES (?)").run(player);
        db.prepare("UPDATE player_stats SET enchantments = enchantments + 1 WHERE player = ?").run(player);
      });
    },

    // Takes a night off an enchantment, or removes it when none is left.
    setEnchantmentDays(player: string, plot: number, daysLeft: number): void {
      if (daysLeft <= 0) db.prepare("DELETE FROM town_enchants WHERE player = ? AND plot = ?").run(player, plot);
      else db.prepare("UPDATE town_enchants SET days_left = ? WHERE player = ? AND plot = ?").run(daysLeft, player, plot);
    },

    // Spells cast on buildings, ever, for the town quests.
    countEnchantments(player: string): number {
      const row = db.prepare("SELECT enchantments FROM player_stats WHERE player = ?").get(player);
      return (row?.enchantments as number | undefined) ?? 0;
    },

    // The meal eaten on a day, if any.
    getMeal(player: string, day: number): StoredMeal | undefined {
      const row = db.prepare("SELECT day, lift FROM town_meals WHERE player = ? AND day = ?").get(player, day);
      return row ? { day: row.day as number, lift: row.lift as number } : undefined;
    },

    addMeal(player: string, day: number, lift: number): boolean {
      return db.prepare("INSERT OR IGNORE INTO town_meals (player, day, lift) VALUES (?, ?, ?)").run(player, day, lift).changes === 1;
    },

    // Whether the player has called on this person on this day, and notes that they have.
    hasCall(player: string, personId: number, day: number): boolean {
      return db.prepare("SELECT 1 FROM town_calls WHERE player = ? AND person_id = ? AND day = ?").get(player, personId, day) !== undefined;
    },

    addCall(player: string, personId: number, day: number): void {
      db.prepare("INSERT OR IGNORE INTO town_calls (player, person_id, day) VALUES (?, ?, ?)").run(player, personId, day);
    },

    // How many calls the player has made on a day.
    countCalls(player: string, day: number): number {
      const row = db.prepare("SELECT COUNT(*) AS n FROM town_calls WHERE player = ? AND day = ?").get(player, day);
      return row!.n as number;
    },

    // People who have become regulars. A regular stays one.
    listRegulars(player: string): number[] {
      return db.prepare("SELECT person_id FROM town_regulars WHERE player = ?").all(player).map((row) => row.person_id as number);
    },

    addRegular(player: string, personId: number): void {
      db.prepare("INSERT OR IGNORE INTO town_regulars (player, person_id) VALUES (?, ?)").run(player, personId);
    },

    // What a day carries, if it has been looked at: a happening or none.
    getTonight(player: string, day: number): StoredTonight | undefined {
      const row = db.prepare("SELECT day, happening, taken FROM town_tonight WHERE player = ? AND day = ?").get(player, day);
      return row ? { day: row.day as number, happening: (row.happening as string | null) ?? null, taken: row.taken === 1 } : undefined;
    },

    // Notes what a day carries. A day is looked at once and keeps its answer.
    setTonight(player: string, day: number, happening: string | null): void {
      db.prepare("INSERT OR IGNORE INTO town_tonight (player, day, happening, taken) VALUES (?, ?, ?, 0)").run(player, day, happening);
    },

    takeTonight(player: string, day: number): void {
      db.prepare("UPDATE town_tonight SET taken = 1 WHERE player = ? AND day = ?").run(player, day);
    },

    // Gives a townsperson a name of their own, once, in place of their trade.
    renamePerson(id: number, name: string, pronoun: Pronoun | null): void {
      db.prepare("UPDATE people SET name = ?, pronoun = ? WHERE id = ?").run(name, pronoun, id);
    },

    // A hand lent at a building on a day. One a building a day.
    addHand(player: string, plot: number, day: number): boolean {
      return db.prepare("INSERT OR IGNORE INTO town_hands (player, plot, day) VALUES (?, ?, ?)").run(player, plot, day).changes === 1;
    },

    hasHand(player: string, plot: number, day: number): boolean {
      return db.prepare("SELECT 1 FROM town_hands WHERE player = ? AND plot = ? AND day = ?").get(player, plot, day) !== undefined;
    },

    // Raises a building on a plot the player owns, or raises the one there to a new tier.
    setBuilding(player: string, plot: number, building: string, tier: number): void {
      db.prepare("UPDATE town_plots SET building = ?, tier = ? WHERE player = ? AND plot = ?").run(building, tier, player, plot);
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
