import { comboKey, slugify, type CombineResult, type ComboDraft, type GameEntry } from "../shared/schema";
import type { ComboGenerator } from "./comboGenerator";
import { tierForDepth, xpForTier, type GameData } from "./gameData";
import type { Store } from "./store";

// Thrown when the player asks for something the rules don't allow.
export class RuleError extends Error {}

const NAME_PATTERN = /^[A-Za-z][A-Za-z '’-]*$/;

export type Combiner = ReturnType<typeof createCombiner>;

export function createCombiner(deps: { data: GameData; store: Store; generate: ComboGenerator }) {
  const { data, store, generate } = deps;
  // Two players making the same new combo at once share one model call and one result.
  const inFlight = new Map<string, Promise<GameEntry>>();

  function getEntry(id: string): GameEntry | undefined {
    return data.entries.get(id) ?? store.getEntry(id);
  }

  function discoveredIds(player: string): string[] {
    const ids = new Set([...data.balance.startingEntries, ...store.getDiscoveries(player)]);
    return [...ids];
  }

  function listDiscovered(player: string): GameEntry[] {
    return discoveredIds(player)
      .map(getEntry)
      .filter((entry) => entry !== undefined);
  }

  async function generateEntry(key: string, a: GameEntry, b: GameEntry): Promise<GameEntry> {
    const reject = (draft: ComboDraft): string | null => {
      if (!NAME_PATTERN.test(draft.name)) return "The name must use only letters, spaces, hyphens and apostrophes.";
      const id = slugify(draft.name);
      if (id === a.id || id === b.id) return `The result cannot be one of the inputs ("${draft.name}").`;
      // Hand-written entries are progression. The model may not hand them out through other combos.
      if (data.entries.has(id)) return `"${draft.name}" already exists and is made another way.`;
      return null;
    };
    const draft = await generate(a, b, reject);
    const id = slugify(draft.name);

    // If an earlier combo already produced this thing, reuse it exactly as it was first written.
    let entry = store.getEntry(id);
    if (!entry) {
      const depth = Math.max(a.depth, b.depth) + 1;
      const tier = tierForDepth(depth, data.balance);
      entry = {
        id,
        name: draft.name,
        kind: "material",
        description: draft.description,
        tags: draft.tags,
        affinity: [...new Set([...a.affinity, ...b.affinity])],
        tier,
        source: "generated",
        depth,
        xp: xpForTier(tier, data.balance),
      };
    }
    store.saveGenerated(key, a.id, b.id, entry, draft.missingTag);
    return store.getEntry(id)!;
  }

  async function combine(player: string, aId: string, bId: string): Promise<CombineResult> {
    const known = new Set(discoveredIds(player));
    const a = known.has(aId) ? getEntry(aId) : undefined;
    const b = known.has(bId) ? getEntry(bId) : undefined;
    if (!a || !b) throw new RuleError("You can only combine things you have discovered.");

    const key = comboKey(a.id, b.id);
    let entry: GameEntry;
    let origin: CombineResult["origin"];

    const authoredId = data.combos.get(key);
    const cachedId = authoredId ? undefined : store.getCombo(key);
    if (authoredId) {
      entry = data.entries.get(authoredId)!;
      origin = "authored";
    } else if (cachedId) {
      entry = store.getEntry(cachedId)!;
      origin = "cached";
    } else {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = generateEntry(key, a, b).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      entry = await pending;
      origin = "generated";
    }

    const isStarting = data.balance.startingEntries.includes(entry.id);
    const firstDiscovery = !isStarting && store.addDiscovery(player, entry.id);
    return { entry, origin, firstDiscovery };
  }

  return { combine, listDiscovered };
}
