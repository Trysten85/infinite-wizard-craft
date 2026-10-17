import { RANKS, type GameEntry, type JobSkin, type QualityId, type RankId, type ShiftOption, type ShiftSlot, type ShiftText } from "../../shared/schema";
import { levelForSpellTier, type GameData } from "../gameData";

// What goes on a job's order board and what the player may fill an order with. Everything here
// is worked out from the game data and what the player has. Nothing is saved or paid out: the
// shift service does that, and src/shared/shifts.ts judges the result.

// An order before it is saved: what it asks for, how demanding it is, and how it reads. The
// `subject` is what it is about, kept beside the text: the model rewrites the text in its own
// words, so the subject is the only way to tell afterwards what an order was about.
export type OrderDraft = { tags: string[]; tier: number; subject: string; text: string };

const STAPLE_PREFIX = "staple:";

function pickOne<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function staplesAt(skin: JobSkin, slot: ShiftSlot, rank: RankId) {
  return skin[slot].staples.filter((staple) => RANKS.indexOf(staple.rank ?? "apprentice") <= RANKS.indexOf(rank));
}

// The tags an order may ask of one slot: those of the staples open at this rank, and those of
// the player's kind of thing that something in the game really carries.
export function slotTags(data: GameData, skin: JobSkin, slot: ShiftSlot, rank: RankId): string[] {
  const from = skin[slot].from;
  const carried = new Set<string>();
  if (from) {
    for (const entry of data.entries.values()) {
      if (from.kinds.some((kind) => kind === entry.kind)) for (const tag of entry.tags) carried.add(tag);
    }
  }
  const tags = [...staplesAt(skin, slot, rank).flatMap((staple) => staple.tags), ...(from?.tags.filter((tag) => carried.has(tag)) ?? [])];
  return [...new Set(tags)];
}

// The highest order tier a player of this level is given: the highest spell tier they could learn.
export function orderTierFor(level: number, data: GameData): number {
  return Math.max(0, data.balance.spellLevelByTier.findLastIndex((needed) => needed <= level));
}

function listed(words: string[]): string {
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
}

// The order in plain words. It names every tag asked for, and nothing else.
export function orderText(subject: string, tags: string[], text: ShiftText): string {
  return `${subject}. It calls for ${listed(tags.map((tag) => text.tagWords[tag] ?? tag))}.`;
}

// One line on how the shift went.
export function resultLine(quality: QualityId, text: ShiftText, random: () => number): string {
  return pickOne(text.results[quality], random);
}

// A stock order for this job. Its tags are taken one from each slot, the method first, so that
// some choice of a Base, a Method, and a Touch covers them all. Its tier is at or just under what
// a player of this level can manage.
export function stockOrder(data: GameData, skin: JobSkin, level: number, rank: RankId, random: () => number): OrderDraft {
  const most = data.balance.shifts.ranks.find((row) => row.id === rank)!.orderTags;
  const fewest = Math.min(2, most);
  const count = fewest + Math.floor(random() * (most - fewest + 1));
  const tags: string[] = [];
  for (const slot of (["method", "base", "touch"] as const).slice(0, count)) {
    const free = slotTags(data, skin, slot, rank).filter((tag) => !tags.includes(tag));
    if (free.length > 0) tags.push(pickOne(free, random));
  }
  const top = orderTierFor(level, data);
  const tier = Math.max(0, top - (random() < 0.5 ? 1 : 0));
  const subject = pickOne(skin.subjects, random);
  return { tags, tier, subject, text: orderText(subject, tags, data.shiftText) };
}

// What the player may put in each slot: the job's own staples for their rank, then whatever of
// theirs fits. A spell fits only if they have learned it and are of a level to cast it.
// Staples come first, then the player's things, finest first.
export function optionsFor(
  data: GameData,
  skin: JobSkin,
  player: { discovered: GameEntry[]; learned: string[]; level: number; rank: RankId },
): Record<ShiftSlot, ShiftOption[]> {
  const learned = new Set(player.learned);
  const forSlot = (slot: ShiftSlot): ShiftOption[] => {
    const staples = staplesAt(skin, slot, player.rank).map((staple) => ({ id: `${STAPLE_PREFIX}${staple.id}`, name: staple.name, tags: staple.tags, tier: 0, own: true }));
    const from = skin[slot].from;
    if (!from) return staples;
    const fits = player.discovered
      .filter((entry) => from.kinds.some((kind) => kind === entry.kind) && entry.tags.some((tag) => from.tags.includes(tag)))
      .filter((entry) => entry.kind !== "spell" || (learned.has(entry.id) && levelForSpellTier(entry.tier, data.balance) <= player.level))
      .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name))
      .map((entry) => ({ id: entry.id, name: entry.name, tags: entry.tags, tier: entry.tier, own: false }));
    return [...staples, ...fits];
  };
  return { base: forSlot("base"), method: forSlot("method"), touch: forSlot("touch") };
}

// Turns the ids a player sent into the options they stand for. Returns null if any of them is
// not on offer in its slot. A Base and a Method are needed. The Touch is optional.
export function chosenFrom(
  options: Record<ShiftSlot, ShiftOption[]>,
  ids: { base: string; method: string; touch?: string | null },
): { base: ShiftOption; method: ShiftOption; touch: ShiftOption | null } | null {
  const base = options.base.find((option) => option.id === ids.base);
  const method = options.method.find((option) => option.id === ids.method);
  const touch = ids.touch ? options.touch.find((option) => option.id === ids.touch) : null;
  if (!base || !method || touch === undefined) return null;
  return { base, method, touch };
}
