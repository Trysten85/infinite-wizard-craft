import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openStore, type Store } from "../src/server/store";
import { comboKey, type GameEntry } from "../src/shared/schema";

function generated(id: string): GameEntry {
  return {
    id,
    name: id,
    kind: "material",
    description: "x",
    tags: ["mineral"],
    affinity: [],
    tier: 0,
    source: "generated",
    depth: 1,
    xp: 10,
  };
}

let store: Store;
beforeEach(() => {
  store = openStore(":memory:");
});

function save(a: string, b: string, result: string) {
  store.saveGenerated(comboKey(a, b), a, b, generated(result));
}

describe("deleting a cached combo", () => {
  it("removes the combo, its entry, and players' discovery of it", () => {
    save("fire", "fire", "ash");
    store.addDiscovery("ann", "ash");
    expect(store.deleteCombo("fire+fire")).toEqual(["ash"]);
    expect(store.getCombo("fire+fire")).toBeUndefined();
    expect(store.getEntry("ash")).toBeUndefined();
    expect(store.getDiscoveries("ann")).toEqual([]);
  });

  it("keeps the entry while another combo still makes it", () => {
    save("fire", "fire", "ash");
    save("fire", "tree", "ash");
    expect(store.deleteCombo("fire+fire")).toEqual([]);
    expect(store.getEntry("ash")).toBeDefined();
  });

  it("removes everything that was built from the deleted entry", () => {
    save("fire", "fire", "ash");
    save("ash", "water", "lye");
    save("lye", "earth", "soap");
    expect(store.deleteCombo("fire+fire").sort()).toEqual(["ash", "lye", "soap"]);
    expect(store.listCombos()).toEqual([]);
  });

  it("removes the entry's tag review hint", () => {
    store.saveGenerated("air+air", "air", "air", generated("mist"), "vapor");
    expect(store.getTagSuggestion("mist")).toBe("vapor");
    store.deleteCombo("air+air");
    expect(store.getTagSuggestion("mist")).toBeUndefined();
  });

  it("does nothing for a key that is not cached", () => {
    expect(store.deleteCombo("fire+water")).toEqual([]);
  });
});

describe("a saved entry", () => {
  // Every player reads these rows, so a price worked out for one player must not reach them.
  // `listDiscovered` puts `learnPrice` on the copy it hands out; the stored row keeps the base.
  it("keeps the base learn cost and drops one player's learn price", () => {
    const spell: GameEntry = { ...generated("spell-ember"), kind: "spell", learnCost: 40, learnPrice: 30 };
    store.saveGenerated("fire+air", "fire", "air", spell);
    expect(store.getEntry("spell-ember")).toMatchObject({ learnCost: 40 });
    expect(store.getEntry("spell-ember")!.learnPrice).toBeUndefined();
  });
});

describe("discoveries", () => {
  it("are recorded once per player", () => {
    expect(store.addDiscovery("ann", "light")).toBe(true);
    expect(store.addDiscovery("ann", "light")).toBe(false);
    expect(store.addDiscovery("bob", "light")).toBe(true);
    expect(store.getDiscoveries("ann")).toEqual(["light"]);
  });
});

describe("people and events", () => {
  it("adds the pronoun column to a saved game made before people had one", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-store-"));
    const path = join(dir, "old.db");
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE people (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      traits TEXT NOT NULL, facts TEXT NOT NULL, fondness INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
      first_day INTEGER NOT NULL, last_day INTEGER NOT NULL, flag TEXT, flag_day INTEGER, UNIQUE (player, name));
      INSERT INTO people (player, name, role, traits, facts, first_day, last_day) VALUES ('ann', 'Odessa Tuck', 'baker', '[]', '[]', 1, 1);`);
    old.close();
    const reopened = openStore(path);
    reopened.addPerson("ann", { name: "Pim Kettlebrook", pronoun: "she", role: "neighbor", traits: [], facts: [] }, 2);
    expect(reopened.listPeople("ann").map((person) => person.pronoun)).toEqual([null, "she"]);
    reopened.close();
    // Opening it a second time changes nothing.
    openStore(path).close();
    rmSync(dir, { recursive: true });
  });

  it("keeps an event hidden until it is shown", () => {
    const store = openStore(":memory:");
    const event = { day: 1, seedId: "small_thief", kind: "comic", mood: ["silly"], personId: 1, stakes: "S", payload: {}, sceneSummary: "A goose." };
    const hidden = store.addEvent("ann", event, "writing");
    expect(store.listEvents("ann")[0]!.state).toBe("writing");
    store.showEvent(hidden);
    expect(store.listEvents("ann")[0]!.state).toBe("pending");
    expect(store.listEvents("bob")).toEqual([]);
    // An event added the plain way is in front of the player at once.
    store.addEvent("bob", event);
    expect(store.listEvents("bob")[0]!.state).toBe("pending");
  });
});

describe("writes made together", () => {
  it("commit together, and an inner failure that is caught undoes only its own part", () => {
    const store = openStore(":memory:");
    store.atomically(() => {
      store.addLedger("ann", 5, "quest", "a");
      try {
        store.atomically(() => {
          store.addLedger("ann", 7, "quest", "b");
          throw new Error("inner");
        });
      } catch {
        // The outer action carries on without the inner one's writes.
      }
      store.addLedger("ann", 1, "quest", "c");
    });
    expect(store.getGold("ann")).toBe(6);
  });

  it("are all undone when the outer action throws", () => {
    const store = openStore(":memory:");
    expect(() =>
      store.atomically(() => {
        store.addLedger("ann", 5, "quest", "a");
        store.atomically(() => store.addPlot("ann", 0));
        throw new Error("outer");
      }),
    ).toThrow("outer");
    expect(store.getGold("ann")).toBe(0);
    expect(store.listPlots("ann")).toEqual([]);
    // And the store is usable afterwards.
    store.addLedger("ann", 2, "quest", "d");
    expect(store.getGold("ann")).toBe(2);
  });
});
