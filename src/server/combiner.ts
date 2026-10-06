import { comboKey, slugify, type CombineResult, type ComboDraft, type GameEntry } from "../shared/schema";
import type { Blocklist } from "./blocklist";
import type { ComboGenerator } from "./comboGenerator";
import { tierForDepth, xpForTier, type GameData } from "./gameData";
import type { Store } from "./store";

export type RuleCode = "rule" | "no-focus" | "missing-needs" | "no-result" | "not-enough-gold" | "sold-out";

// Thrown when the player asks for something the rules don't allow.
export class RuleError extends Error {
  constructor(
    message: string,
    readonly code: RuleCode = "rule",
  ) {
    super(message);
  }
}

const NAME_PATTERN = /^[A-Za-z][A-Za-z '’-]*$/;

export type Combiner = ReturnType<typeof createCombiner>;

// Schools, spells, and jobs only combine by hand-written recipes. The material generator must not
// write for them: what a job makes from a material is crafting, which has its own rules later.
function isAuthoredOnly(entry: GameEntry): boolean {
  return entry.kind === "school" || entry.kind === "spell" || entry.kind === "job";
}

export function createCombiner(deps: {
  data: GameData;
  store: Store;
  generate: ComboGenerator;
  blocklist?: Blocklist;
}) {
  const { data, store, generate, blocklist } = deps;
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
      // Plain things have short names. Long ones are where the invented fantasy compounds creep in.
      if (draft.name.trim().split(/\s+/).length > 2) return "Use a plainer name: one everyday word, two at most.";
      const id = slugify(draft.name);
      if (id === a.id || id === b.id) return `The result cannot be one of the inputs ("${draft.name}").`;
      // Hand-written entries are progression. The model may not hand them out through other combos.
      if (data.entries.has(id)) return `"${draft.name}" already exists and is made another way.`;
      // The reason never names the blocked term, so the list itself is never shown to the model.
      if (blocklist && blocklist.find(draft.name).length > 0) return "That name is not available. Choose a different one.";
      if (blocklist && blocklist.find(draft.description).length > 0) {
        return "The description uses a proper name. Rewrite it without naming any person, place, or group.";
      }
      // From the voice guide's "never appears" list.
      if (/[0-9!]/.test(draft.description)) return "The description must not contain digits or exclamation marks.";
      return null;
    };
    const draft = await generate(a, b, reject);
    const name = draft.name[0]!.toUpperCase() + draft.name.slice(1);
    const id = slugify(name);

    // If an earlier combo already produced this thing, reuse it exactly as it was first written.
    let entry = store.getEntry(id);
    if (!entry) {
      const depth = Math.max(a.depth, b.depth) + 1;
      const tier = tierForDepth(depth, data.balance);
      entry = {
        id,
        name,
        kind: "material",
        description: draft.description,
        tags: draft.tags,
        affinity: [...new Set([...a.affinity, ...b.affinity])],
        tier,
        source: "generated",
        depth,
        xp: xpForTier(tier, data.balance),
        // What is made from a storybook thing may be a storybook thing too.
        ...(draft.storybook ? { wonder: true } : {}),
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

    const recipe = data.combos.get(key);
    const cachedId = recipe ? undefined : store.getCombo(key);
    if (recipe) {
      entry = data.entries.get(recipe.result)!;
      if (entry.kind === "spell" && ![...known].some((id) => getEntry(id)?.kind === "focus")) {
        throw new RuleError("You need a focus to shape a spell.", "no-focus");
      }
      const missing = recipe.needs.filter((id) => !known.has(id)).map((id) => getEntry(id)!.name);
      if (missing.length > 0) throw new RuleError(`${entry.name} needs: ${missing.join(", ")}.`, "missing-needs");
      origin = "authored";
    } else if (isAuthoredOnly(a) || isAuthoredOnly(b)) {
      throw new RuleError("Nothing comes of it yet.", "no-result");
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

  // Every job, for the journal. An undiscovered job shows only its hint.
  function listJobs() {
    return [...data.jobs.values()].map((job) => ({ id: job.id, magic: job.magic, hint: job.hint, starter: job.starter ?? false }));
  }

  return { combine, listDiscovered, listJobs };
}
