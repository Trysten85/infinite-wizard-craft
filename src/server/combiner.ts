import { comboKey, slugify, type CombineResult, type ComboDraft, type GameEntry } from "../shared/schema";
import type { Blocklist } from "./blocklist";
import { pairShare } from "./comboContext";
import type { ComboGenerator } from "./comboGenerator";
import { tierForDepth, xpForTier, type GameData } from "./gameData";
import type { Store } from "./store";
import { canonicalName, isBanned, isOnlyIngredients, isRealName, overusedIn } from "./names";
import { endsCleanly, tooLong } from "./voice";

export type RuleCode = "rule" | "no-focus" | "missing-needs" | "no-result" | "not-enough-gold" | "sold-out" | "level-too-low" | "no-job" | "shift-not-ready";

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

// An ingredient's own name with a new ending: Salted or Salty from Salt, Sands from Sand. That
// describes the ingredient. It is not a new thing.
export function isInflection(name: string, a: string, b: string): boolean {
  const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");
  const word = letters(name);
  return !name.trim().includes(" ") && [a, b].map(letters).some((base) => base.length >= 3 && word.startsWith(base) && word.length - base.length <= 2);
}

export type Combiner = ReturnType<typeof createCombiner>;

// Schools, spells, and jobs only combine by hand-written recipes. The material generator must not
// write for them: what a job makes from a material is crafting, which has its own rules later.
function isAuthoredOnly(entry: GameEntry): boolean {
  return entry.kind === "school" || entry.kind === "spell" || entry.kind === "job";
}

// Everything a model-made name and description must satisfy for one pair. Returns the reason an
// answer is refused, or null. The game and the overnight bake both go by this.
export function comboRules(deps: { data: GameData; blocklist?: Blocklist }) {
  const { data, blocklist } = deps;
  const storybook = new Set(data.storybook.map((item) => slugify(item.name)));
  return (a: GameEntry, b: GameEntry) =>
    (draft: ComboDraft): string | null => {
      if (!NAME_PATTERN.test(draft.name)) return "The name must use only letters, spaces, hyphens and apostrophes.";
      // Plain things have short names. Long ones are where the invented fantasy compounds creep in.
      if (draft.name.trim().split(/\s+/).length > 2) return "Use a plainer name: one everyday word, two at most.";
      const id = slugify(draft.name);
      if (id === a.id || id === b.id) return `The result cannot be one of the inputs ("${draft.name}").`;
      // The reason never names the blocked term, so the list itself is never shown to the model.
      // The name is checked as the game will show it, with its capital.
      if (blocklist && blocklist.find(draft.name[0]!.toUpperCase() + draft.name.slice(1)).length > 0) return "That name is not available. Choose a different one.";
      if (isInflection(draft.name, a.name, b.name)) return `"${draft.name}" is only an ingredient's name with a new ending. Name the new thing the two make.`;
      if (isOnlyIngredients(draft.name, a.name, b.name)) return `"${draft.name}" only says what went in. Name the new thing the two make.`;
      // A real word, or a name the game already vouches for. This is what tells Saltwater from Bloodfire.
      const vouched = (name: string) => data.entries.has(slugify(name)) || storybook.has(slugify(name));
      if (data.words.size > 0 && !isRealName(draft.name, data.words, vouched)) return `"${draft.name}" is not a real, well-known word. Name a real thing.`;
      if (isBanned(draft.name, data.banned)) return `"${draft.name}" does not belong in this world: nothing from after the age of steam. Name something older.`;
      // Hand-written entries are progression. The model may not hand them out through other combos.
      // A thing from the overnight bake is different: other pairs may make it too.
      if (data.entries.has(id) && !data.bakedIds.has(id)) return `"${draft.name}" already exists and is made another way.`;
      if (blocklist && blocklist.find(draft.description).length > 0) {
        return "The description uses a proper name. Rewrite it without naming any person, place, or group.";
      }
      if (!endsCleanly(draft.description)) return "The description stops in the middle of a sentence. Write one or two short, complete sentences.";
      const long = tooLong(draft.description, data.balance.generation);
      if (long) return long;
      // From the voice guide's "never appears" list.
      if (/[0-9!]/.test(draft.description)) return "The description must not contain digits or exclamation marks.";
      const worn = overusedIn(draft.description, data.overused);
      if (worn) return `The description leans on "${worn}", which has been used too often. Say it another way.`;
      return null;
    };
}

export function createCombiner(deps: {
  data: GameData;
  store: Store;
  generate: ComboGenerator;
  blocklist?: Blocklist;
}) {
  const { data, store, generate, blocklist } = deps;
  const rules = comboRules({ data, blocklist });
  // Two players making the same new combo at once share one model call and one result.
  const inFlight = new Map<string, Promise<GameEntry>>();

  // A saved entry's XP is worked out again from its tier, so it follows the balance file as it
  // stands now and not as it stood when the entry was first made.
  function getEntry(id: string): GameEntry | undefined {
    const authored = data.entries.get(id);
    if (authored) return authored;
    const saved = store.getEntry(id);
    return saved && { ...saved, xp: xpForTier(saved.tier, data.balance) };
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
    const reject = rules(a, b);
    const draft = await generate(a, b, reject);
    const name = canonicalName(draft.name, data.aliases);
    const id = slugify(name);

    // If an earlier combo already produced this thing, reuse it exactly as it was first written.
    // The same goes for a thing from the overnight bake.
    let entry = data.bakedIds.has(id) ? data.entries.get(id) : store.getEntry(id);
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
    return getEntry(id)!;
  }

  async function combine(player: string, aId: string, bId: string): Promise<CombineResult> {
    const known = new Set(discoveredIds(player));
    const a = known.has(aId) ? getEntry(aId) : undefined;
    const b = known.has(bId) ? getEntry(bId) : undefined;
    if (!a || !b) throw new RuleError("You can only combine things you have discovered.");

    const key = comboKey(a.id, b.id);
    let entry: GameEntry;
    let origin: CombineResult["origin"];

    // A pair a reviewer has said makes nothing. The line is always the same one for that pair.
    if (data.noResults.has(key)) {
      const lines = data.noResultLines;
      throw new RuleError(lines[Math.floor(pairShare(a, b) * lines.length)]!, "no-result");
    }
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
      entry = getEntry(cachedId)!;
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
