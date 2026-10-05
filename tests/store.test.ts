import { beforeEach, describe, expect, it } from "vitest";
import { openStore, type Store } from "../src/server/store";
import { comboKey, type GameEntry } from "../src/shared/schema";

function generated(id: string): GameEntry {
  return {
    id,
    name: id,
    kind: "material",
    description: "x",
    tags: ["fire"],
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

  it("does nothing for a key that is not cached", () => {
    expect(store.deleteCombo("fire+water")).toEqual([]);
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
