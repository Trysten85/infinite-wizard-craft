import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { buildPath } from "../src/server/paths";
import type { ShopSlot } from "../src/shared/schema";
import { data, newGame, TO_FIRE_BOLT } from "./helpers";

const { shop: rules } = data.balance;

function expectedPrice(slot: ShopSlot, have: string[]): number {
  const missing = buildPath(data, slot.entry.id, have).length;
  const base = rules.basePrice + rules.pricePerDepth * slot.entry.depth + rules.pricePerMissingStep * missing;
  return Math.round(slot.entry.kind === "spell" ? base * rules.spellMarkup : base);
}

describe("the shelf", () => {
  it("holds six different things: materials and spells the player does not have", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { shop } = newGame(seed);
      const { slots } = shop.view("ann");
      expect(slots).toHaveLength(6);
      expect(new Set(slots.map((slot) => slot.entry.id)).size).toBe(6);
      expect(slots.filter((slot) => slot.type === "random").length).toBeGreaterThanOrEqual(3);
      for (const { entry } of slots) {
        expect(["material", "spell"], entry.id).toContain(entry.kind);
        expect(rules.neverSells, entry.id).not.toContain(entry.id);
        expect(data.balance.startingEntries).not.toContain(entry.id);
      }
    }
  });

  it("never stocks something the player already has", async () => {
    const { shop, play, combiner } = newGame();
    await play("ann", TO_FIRE_BOLT);
    const have = new Set(combiner.listDiscovered("ann").map((entry) => entry.id));
    for (const slot of shop.view("ann").slots) expect(have.has(slot.entry.id), slot.entry.id).toBe(false);
  });

  it("prices by depth and by how many combos away the player is, doubled for spells", () => {
    const { shop } = newGame();
    for (const slot of shop.view("ann").slots) expect(slot.price, slot.entry.id).toBe(expectedPrice(slot, []));
  });

  it("charges less for something the player is already close to", () => {
    const fresh = newGame();
    const close = newGame();
    for (const id of ["steam", "salt"]) close.store.addDiscovery("ann", id);
    const sulfur = data.entries.get("sulfur")!;
    const priceOf = (game: ReturnType<typeof newGame>) => {
      game.store.setShop("ann", 0, [{ slot: 0, entryId: sulfur.id, type: "random", reason: "" }]);
      return game.shop.view("ann").slots[0]!.price;
    };
    expect(priceOf(fresh)).toBe(5 + 3 * 3 + 4 * 3);
    expect(priceOf(close)).toBe(5 + 3 * 3 + 4 * 1);
  });

  it("keeps the price it first showed, however close the player gets later", async () => {
    const { shop, play, store } = newGame();
    store.setShop("ann", 0, [{ slot: 0, entryId: "sulfur", type: "random", reason: "" }]);
    const first = shop.view("ann").slots[0]!.price;
    await play("ann", [["fire", "water"], ["steam", "earth"]]);
    expect(shop.view("ann").slots[0]!.price).toBe(first);
    expect(store.getPrice("ann", "sulfur")).toBe(first);
  });
});

describe("restocking", () => {
  it("keeps the same shelf until five new things have been made by combining", async () => {
    const { shop, play } = newGame();
    const ids = () => shop.view("ann").slots.map((slot) => slot.entry.id);
    const first = ids();
    expect(shop.view("ann").restockIn).toBe(5);
    await play("ann", TO_FIRE_BOLT.slice(0, 4));
    expect(ids()).toEqual(first);
    expect(shop.view("ann").restockIn).toBe(1);
    await play("ann", [TO_FIRE_BOLT[4]!]);
    expect(ids()).not.toEqual(first);
    expect(shop.view("ann").restockIn).toBe(5);
  });

  it("does not count purchases, and leaves a bought slot empty until then", async () => {
    const { shop, store } = newGame();
    store.addLedger("ann", 1000, "quest", "test-grant");
    const before = shop.view("ann");
    shop.buy("ann", 0);
    shop.buy("ann", 1);
    const after = shop.view("ann");
    expect(after.restockIn).toBe(before.restockIn);
    expect(after.slots.map((slot) => slot.entry.id)).toEqual(before.slots.map((slot) => slot.entry.id));
    expect(after.slots.map((slot) => slot.sold)).toEqual([true, true, false, false, false, false]);
  });

  it("marks a slot sold once the player makes that thing themselves", async () => {
    const { shop, play, store } = newGame();
    store.setShop("ann", 0, [{ slot: 0, entryId: "mud", type: "random", reason: "" }]);
    expect(shop.view("ann").slots[0]!.sold).toBe(false);
    await play("ann", [["water", "earth"]]);
    expect(shop.view("ann").slots[0]!.sold).toBe(true);
  });
});

describe("buying", () => {
  it("takes the gold, gives the entry and its XP, and pays no discovery gold", () => {
    const { shop, store, progress, combiner } = newGame();
    store.addLedger("ann", 1000, "quest", "test-grant");
    const slot = shop.view("ann").slots[0]!;
    const before = progress.getProgress("ann");
    const { entry, rewards } = shop.buy("ann", 0);
    expect(entry.id).toBe(slot.entry.id);
    expect(combiner.listDiscovered("ann").map((item) => item.id)).toContain(entry.id);
    const after = progress.getProgress("ann");
    expect(after.xp).toBe(before.xp + entry.xp);
    // The only gold that can arrive with a purchase is a quest it happens to complete.
    const questGold = rewards.quests.reduce((total, quest) => total + quest.gold, 0);
    expect(rewards.gold).toBe(questGold);
    expect(after.gold).toBe(before.gold - slot.price + questGold);
    expect(store.getLedgerRefs("ann", "discovery")).not.toContain(entry.id);
  });

  it("is refused without enough gold, and for a slot already sold", () => {
    const { shop, store, progress } = newGame();
    expect(() => shop.buy("ann", 0)).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    expect(progress.getProgress("ann").gold).toBe(0);
    store.addLedger("ann", 1000, "quest", "test-grant");
    shop.buy("ann", 0);
    expect(() => shop.buy("ann", 0)).toThrowError(expect.objectContaining({ code: "sold-out" }));
    expect(() => shop.buy("ann", 99)).toThrow(/nothing on that shelf/);
  });
});

describe("tailored slots", () => {
  const tailored = (game: ReturnType<typeof newGame>, player = "ann") => game.shop.view(player).slots.filter((slot) => slot.type === "tailored");

  it("stock the one ingredient the player is missing for a spell", () => {
    const game = newGame();
    const owned = ["light", "spellbook", "evocation", "spell-fire-bolt", "spell-burning-hands", "spell-scorching-ray", "bat-guano"];
    for (const id of owned) game.store.addDiscovery("ann", id);
    expect(tailored(game).find((slot) => slot.reason === "One ingredient short of Fireball.")?.entry.id).toBe("sulfur");
  });

  it("point a player with no job toward Wizard, skipping what they can already make", () => {
    const pick = tailored(newGame()).find((slot) => slot.reason === "On the way to Wizard.");
    // Mud is also on the way, but a new player can make it in one move for free.
    expect(pick?.entry.id).toBe("tree");
  });

  it("stock what the player's newest job wants", () => {
    const game = newGame();
    for (const id of ["person", "forge", "farmer", "blacksmith"]) game.store.addDiscovery("ann", id);
    const pick = tailored(game).find((slot) => slot.reason === "Stock for a Blacksmith.");
    const wanted = data.jobs.get("blacksmith")!.wantedTags;
    expect(pick?.entry.tags.some((tag) => wanted.includes(tag))).toBe(true);
  });

  it("offer a spell the player could cast now, from a school they have learned from", async () => {
    const game = newGame();
    await game.play("ann", TO_FIRE_BOLT);
    game.progress.learn("ann", "spell-fire-bolt");
    game.store.setShop("ann", -100, []);
    const pick = tailored(game).find((slot) => slot.reason === "A spell you could cast now.");
    expect(pick?.entry).toMatchObject({ kind: "spell", school: "evocation" });
    expect(pick!.entry.tier).toBeLessThanOrEqual(game.progress.getProgress("ann").level);
  });

  it("never tailor a slot to something the player can make for free in one move", async () => {
    for (const seed of [1, 2, 3]) {
      const game = newGame(seed);
      await game.play("ann", TO_FIRE_BOLT);
      game.progress.learn("ann", "spell-fire-bolt");
      game.store.setShop("ann", -100, []);
      const have = new Set(game.combiner.listDiscovered("ann").map((entry) => entry.id));
      for (const slot of tailored(game)) {
        const free = [...data.combos.values()].some(
          (recipe) => recipe.result === slot.entry.id && [...recipe.inputs, ...recipe.needs].every((id) => have.has(id)),
        );
        expect(free, `${slot.entry.id}: ${slot.reason}`).toBe(false);
      }
    }
  });

  it("otherwise offer a material a little deeper than anything the player has made", () => {
    const pick = tailored(newGame()).find((slot) => slot.reason === "A step beyond what you have made.");
    expect(pick?.entry.kind).toBe("material");
    expect(pick!.entry.depth).toBeLessThanOrEqual(2);
  });
});

describe("the routes", () => {
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("add progress to the player and combine responses without changing the old fields", async () => {
    const { combiner, progress, shop } = newGame();
    const app = createApp(combiner, { progress, shop });
    const player = (await (await app.request("/api/players/ann")).json()) as Record<string, any>;
    expect(player.entries.map((entry: { id: string }) => entry.id)).toEqual(data.balance.startingEntries);
    expect(player.progress).toMatchObject({ gold: 0, level: 1 });

    const combined = (await (await app.request("/api/players/ann/combine", post({ a: "fire", b: "air" }))).json()) as Record<string, any>;
    expect(combined).toMatchObject({ entry: { id: "light" }, origin: "authored", firstDiscovery: true });
    expect(combined.rewards).toEqual({ gold: 6, quests: [{ id: "first-combine", title: "Combine two elements", gold: 5 }] });
    expect(combined.progress.gold).toBe(6);
  });

  it("serve the shelf, sell from it, and refuse what the rules refuse", async () => {
    const { combiner, progress, shop, store } = newGame();
    const app = createApp(combiner, { progress, shop });
    const shelf = (await (await app.request("/api/players/ann/shop")).json()) as Record<string, any>;
    expect(shelf.slots).toHaveLength(6);
    expect(shelf.restockIn).toBe(5);

    const refused = await app.request("/api/players/ann/shop/buy", post({ slot: 0 }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "not-enough-gold" });

    store.addLedger("ann", 1000, "quest", "test-grant");
    const bought = (await (await app.request("/api/players/ann/shop/buy", post({ slot: 0 }))).json()) as Record<string, any>;
    expect(bought.entry.id).toBe(shelf.slots[0].entry.id);
    expect(bought.shop.slots[0].sold).toBe(true);
    expect(bought.progress.gold).toBeLessThan(1000);
  });

  it("learn a spell through the learn route", async () => {
    const { combiner, progress, shop, play } = newGame();
    const app = createApp(combiner, { progress, shop });
    await play("ann", TO_FIRE_BOLT);
    const learned = (await (await app.request("/api/players/ann/learn", post({ spell: "spell-fire-bolt" }))).json()) as Record<string, any>;
    expect(learned.progress.learned).toEqual(["spell-fire-bolt"]);
    expect(learned).toMatchObject({ cost: 10, spell: { id: "spell-fire-bolt", name: "Fire Bolt" } });
    const again = await app.request("/api/players/ann/learn", post({ spell: "spell-fire-bolt" }));
    expect(again.status).toBe(400);
  });
});
