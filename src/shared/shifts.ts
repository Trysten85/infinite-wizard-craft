import type { QualityId, RankId, RankView, ShiftOption, ShiftRules } from "./schema";

// The rules of a work shift, as plain functions of the order, what the player chose, their rank,
// and the numbers under `shifts` in config/balance.json. Nothing here touches a saved game, so
// the server decides results with it and the page previews them with it.

// What a shift is judged against, and what it was done with.
export type ShiftAsk = { tags: string[]; tier: number };
type Input = Pick<ShiftOption, "tags" | "tier">;
export type ShiftPick = { base: Input; method: Input; touch?: Input | null };

// Scores land exactly on a threshold often (a full match scores 1), so comparisons allow for
// the last digit of a sum of fractions.
const EPSILON = 1e-9;

function inputsOf(pick: ShiftPick): Input[] {
  return [pick.base, pick.method, ...(pick.touch ? [pick.touch] : [])];
}

function rankRow(rankId: RankId, rules: ShiftRules) {
  return rules.ranks.find((rank) => rank.id === rankId) ?? rules.ranks[0]!;
}

// The rank held after this many shifts in a job. It only ever goes up.
export function rankFor(shiftsDone: number, rules: ShiftRules) {
  return rules.ranks.findLast((rank) => shiftsDone >= rank.shifts) ?? rules.ranks[0]!;
}

export function rankView(shiftsDone: number, rules: ShiftRules): RankView {
  const rank = rankFor(shiftsDone, rules);
  const next = rules.ranks[rules.ranks.indexOf(rank) + 1];
  return { id: rank.id, name: rank.name, shifts: shiftsDone, next: next ? { name: next.name, shifts: next.shifts } : null };
}

// Which of the order's tags the chosen inputs cover between them.
export function coveredTags(ask: ShiftAsk, pick: ShiftPick): string[] {
  const chosen = new Set(inputsOf(pick).flatMap((input) => input.tags));
  return ask.tags.filter((tag) => chosen.has(tag));
}

// Whether the best thing chosen is at least as fine as the order asks. A method has no tier.
export function meetsTier(ask: ShiftAsk, pick: ShiftPick): boolean {
  return Math.max(pick.base.tier, pick.touch?.tier ?? 0) >= ask.tier;
}

// The share of the order's tags covered, plus a bonus for meeting its tier, plus the rank's bonus.
export function matchScore(ask: ShiftAsk, pick: ShiftPick, rankId: RankId, rules: ShiftRules): number {
  const share = ask.tags.length === 0 ? 1 : coveredTags(ask, pick).length / ask.tags.length;
  return share + (meetsTier(ask, pick) ? rules.tierBonus : 0) + rankRow(rankId, rules).bonus;
}

function stepFor(score: number, rules: ShiftRules): number {
  return Math.max(0, rules.qualities.findLastIndex((quality) => score + EPSILON >= quality.from));
}

// The quality a score earns before luck has its say.
export function qualityFor(score: number, rules: ShiftRules): QualityId {
  return rules.qualities[stepFor(score, rules)]!.id;
}

// How the shift went. `roll` is a number from 0 up to, not including, 1: a low one lands a step
// down, a high one a step up, and most leave the result where the score put it. The result is
// never below the lowest quality, so there is no ruined shift.
export function resolveQuality(ask: ShiftAsk, pick: ShiftPick, rankId: RankId, roll: number, rules: ShiftRules): QualityId {
  const step = stepFor(matchScore(ask, pick, rankId, rules), rules);
  const moved = roll < rules.variance.down ? step - 1 : roll >= 1 - rules.variance.up ? step + 1 : step;
  return rules.qualities[Math.min(rules.qualities.length - 1, Math.max(0, moved))]!.id;
}

// What to tell the player before they confirm: the likeliest result, and the worst and best it
// could come out. The real result always falls between `low` and `high`.
export function previewRange(ask: ShiftAsk, pick: ShiftPick, rankId: RankId, rules: ShiftRules): { low: QualityId; likely: QualityId; high: QualityId } {
  const step = stepFor(matchScore(ask, pick, rankId, rules), rules);
  const low = rules.variance.down > 0 ? Math.max(0, step - 1) : step;
  const high = rules.variance.up > 0 ? Math.min(rules.qualities.length - 1, step + 1) : step;
  return { low: rules.qualities[low]!.id, likely: rules.qualities[step]!.id, high: rules.qualities[high]!.id };
}

// What a shift pays: the order's tier sets the base, and the quality scales it.
export function payFor(ask: ShiftAsk, qualityId: QualityId, rules: ShiftRules): { gold: number; xp: number; rep: number } {
  const quality = rules.qualities.find((item) => item.id === qualityId) ?? rules.qualities[0]!;
  const byTier = (table: number[]) => table[Math.min(ask.tier, table.length - 1)]!;
  return {
    gold: Math.round(byTier(rules.pay.goldByTier) * quality.gold),
    xp: Math.round(byTier(rules.pay.xpByTier) * quality.xp),
    rep: quality.rep,
  };
}
