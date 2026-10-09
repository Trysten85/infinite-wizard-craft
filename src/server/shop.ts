import type { GameEntry, Rewards, ShopSlot, ShopView } from "../shared/schema";
import { RuleError } from "./combiner";
import { levelForSpellTier, type GameData } from "./gameData";
import { buildPath } from "./paths";
import { repBandFor, type ProgressService } from "./progress";
import type { Store } from "./store";

export type ShopService = ReturnType<typeof createShop>;

type Pick = { entry: GameEntry; reason: string };
const RANDOM_SLOTS = 3;

export function createShop(deps: {
  data: GameData;
  store: Store;
  progress: ProgressService;
  listDiscovered: (player: string) => GameEntry[];
  // A number from 0 up to, not including, 1. Tests pass their own so stock is repeatable.
  random?: () => number;
}) {
  const { data, store, progress, listDiscovered, random = Math.random } = deps;
  const { shop: rules } = data.balance;
  const neverSells = new Set(rules.neverSells);

  const pickRandom = <T>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];

  // Discoveries made by combining. Purchases are left out, so buying never triggers a restock.
  function craftedCount(player: string): number {
    return store.getDiscoveries(player).length - store.getLedgerRefs(player, "shop").length - store.getLedgerRefs(player, "gift").length;
  }

  // The shop sells materials and spells the player does not have. Elements, schools, jobs, and
  // the focus are progression and are never for sale.
  function pool(have: Set<string>): GameEntry[] {
    return [...data.entries.values()].filter(
      (entry) => (entry.kind === "material" || entry.kind === "spell") && !have.has(entry.id) && !neverSells.has(entry.id),
    );
  }

  // The base price is worked out the first time an item is shown to a player, and kept after that.
  // What the player pays is that base, shifted a little by their standing with the town.
  function priceFor(player: string, entry: GameEntry, have: Set<string>): number {
    let base = store.getPrice(player, entry.id);
    if (base === undefined) {
      const missingSteps = buildPath(data, entry.id, have).length;
      const raw = rules.basePrice + rules.pricePerDepth * entry.depth + rules.pricePerMissingStep * missingSteps;
      base = Math.round(entry.kind === "spell" ? raw * rules.spellMarkup : raw);
      store.setPrice(player, entry.id, base);
    }
    const shift = repBandFor(store.getStats(player).rep, data.balance).shopPrice;
    return Math.max(1, Math.round(base * (1 + shift)));
  }

  // True if the player already holds everything some recipe for this entry asks for. There is no
  // point tailoring a slot to something that is one move away for free.
  function canMakeNow(entry: GameEntry, have: Set<string>, hasFocus: boolean): boolean {
    if (entry.kind === "spell" && !hasFocus) return false;
    return [...data.combos.values()].some(
      (recipe) => recipe.result === entry.id && [...recipe.inputs, ...recipe.needs].every((id) => have.has(id)),
    );
  }

  // The one thing the player is missing for something they could otherwise make right now.
  function nextStep(discovered: GameEntry[], have: Set<string>, available: GameEntry[]): Pick | undefined {
    const hasFocus = discovered.some((entry) => entry.kind === "focus");
    const forSale = new Map(available.map((entry) => [entry.id, entry]));
    const options: (Pick & { goal: GameEntry })[] = [];
    for (const recipe of data.combos.values()) {
      const goal = data.entries.get(recipe.result)!;
      if (have.has(goal.id) || (goal.kind === "spell" && !hasFocus)) continue;
      const missing = [...new Set([...recipe.inputs, ...recipe.needs])].filter((id) => !have.has(id));
      const entry = missing.length === 1 ? forSale.get(missing[0]!) : undefined;
      if (entry) options.push({ entry, goal, reason: `One ingredient short of ${goal.name}.` });
    }
    // A spell or a job is a better reason to stock something than another material.
    const weight = (goal: GameEntry) => (goal.kind === "spell" || goal.kind === "job" ? 0 : 1);
    return options.sort((a, b) => weight(a.goal) - weight(b.goal) || a.entry.depth - b.entry.depth)[0];
  }

  // Something a good build for the job the player has taken up wants. Before they have taken
  // one up, a step toward the starter job.
  function forJob(player: string, have: Set<string>, available: GameEntry[]): Pick | undefined {
    const newestJob = progress.getProgress(player).job;
    if (newestJob) {
      const wanted = new Set(data.jobs.get(newestJob.id)!.wantedTags);
      const score = (entry: GameEntry) => entry.tags.filter((tag) => wanted.has(tag)).length;
      const best = Math.max(0, ...available.map(score));
      const entry = best > 0 ? pickRandom(available.filter((item) => score(item) === best)) : undefined;
      return entry && { entry, reason: `Stock for a ${newestJob.name}.` };
    }
    const starter = [...data.jobs.values()].find((job) => job.starter);
    if (!starter) return undefined;
    const forSale = new Map(available.map((entry) => [entry.id, entry]));
    const step = buildPath(data, starter.id, have).find((recipe) => forSale.has(recipe.result));
    return step && { entry: forSale.get(step.result)!, reason: `On the way to ${starter.name}.` };
  }

  // A spell the player could cast now, in a school they have already learned from. Failing that,
  // a material a little deeper than anything they have made.
  function forLevel(player: string, discovered: GameEntry[], available: GameEntry[]): Pick | undefined {
    const { level, learned } = progress.getProgress(player);
    const schools = new Set(learned.map((id) => data.entries.get(id)?.school));
    const spells = available
      .filter((entry) => entry.kind === "spell" && schools.has(entry.school) && levelForSpellTier(entry.tier, data.balance) <= level)
      .sort((a, b) => a.tier - b.tier);
    const lowest = spells.filter((spell) => spell.tier === spells[0]!.tier);
    if (lowest.length > 0) return { entry: pickRandom(lowest)!, reason: "A spell you could cast now." };

    const deepest = Math.max(0, ...discovered.filter((entry) => entry.kind === "material").map((entry) => entry.depth));
    const beyond = available.filter((entry) => entry.kind === "material" && entry.depth > deepest && entry.depth <= deepest + 2);
    const entry = pickRandom(beyond);
    return entry && { entry, reason: "A step beyond what you have made." };
  }

  function restock(player: string): void {
    const discovered = listDiscovered(player);
    const have = new Set(discovered.map((entry) => entry.id));
    let available = pool(have);
    const take = (entry: GameEntry) => {
      available = available.filter((item) => item.id !== entry.id);
    };

    const slots: { slot: number; entryId: string; type: ShopSlot["type"]; reason: string }[] = [];
    const add = (entry: GameEntry, type: ShopSlot["type"], reason: string) => {
      take(entry);
      priceFor(player, entry, have);
      slots.push({ slot: slots.length, entryId: entry.id, type, reason });
    };

    // The tailored slots choose first, so a random pick never takes the thing a player most needs.
    // They never offer something the player could make for free in one move.
    const hasFocus = discovered.some((entry) => entry.kind === "focus");
    const worthSelling = () => available.filter((entry) => !canMakeNow(entry, have, hasFocus));
    const tailored = [
      () => nextStep(discovered, have, worthSelling()),
      () => forJob(player, have, worthSelling()),
      () => forLevel(player, discovered, worthSelling()),
    ];
    const picks: (Pick | undefined)[] = [];
    for (const choose of tailored) {
      const pick = choose();
      if (pick) take(pick.entry);
      picks.push(pick);
    }
    for (let i = 0; i < RANDOM_SLOTS; i++) {
      const entry = pickRandom(available);
      if (entry) add(entry, "random", "");
    }
    // A tailored slot with nothing fitting becomes one more random item.
    for (const pick of picks) {
      const entry = pick?.entry ?? pickRandom(available);
      if (entry) add(entry, pick ? "tailored" : "random", pick?.reason ?? "");
    }
    store.setShop(player, craftedCount(player), slots);
  }

  function view(player: string): ShopView {
    const crafted = craftedCount(player);
    let stock = store.getShop(player);
    if (!stock || crafted - stock.stockedAt >= rules.restockEvery) {
      restock(player);
      stock = store.getShop(player)!;
    }
    const have = new Set(listDiscovered(player).map((entry) => entry.id));
    const slots = stock.slots.flatMap((slot): ShopSlot[] => {
      const entry = data.entries.get(slot.entryId);
      // An entry removed from the game data since the shelf was stocked simply leaves a gap.
      if (!entry) return [];
      return [
        {
          slot: slot.slot,
          type: slot.type,
          reason: slot.reason,
          entry,
          price: priceFor(player, entry, have),
          // Something the player has since made themselves is no longer worth selling to them.
          sold: slot.sold || have.has(entry.id),
        },
      ];
    });
    return { slots, restockIn: rules.restockEvery - (crafted - stock.stockedAt) };
  }

  // Buying is a shortcut: the player gets the entry as if they had made it. It pays XP, not gold.
  function buy(player: string, slotNumber: number): { entry: GameEntry; rewards: Rewards } {
    const slot = view(player).slots.find((item) => item.slot === slotNumber);
    if (!slot) throw new RuleError("There is nothing on that shelf.");
    if (slot.sold) throw new RuleError(`${slot.entry.name} is no longer for sale.`, "sold-out");
    const { gold } = progress.getProgress(player);
    if (slot.price > gold) {
      throw new RuleError(`${slot.entry.name} costs ${slot.price} gold. You have ${gold}.`, "not-enough-gold");
    }
    store.addLedger(player, -slot.price, "shop", slot.entry.id);
    store.addDiscovery(player, slot.entry.id);
    store.markSold(player, slot.slot);
    return { entry: slot.entry, rewards: progress.settle(player) };
  }

  return { view, buy };
}
