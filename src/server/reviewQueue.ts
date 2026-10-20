import { BAKE_FAILURES, comboKey, type BakedCombo, type BakeFailure } from "../shared/schema";

// The order a reviewer meets baked pairs in, and what each key does to a row. Pure: the keyboard
// tool in src/tools/review.ts reads the keys, asks the model for alternatives, and saves.

export type QueueGroup = "confirm-tags" | "alternatives" | "priority-1" | "sample";

export type QueueItem = { row: BakedCombo; group: QueueGroup };

const hash = (text: string): number => {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
};

// Rows that wait on a pick from alternatives: the seed file's four, a duplicate result, or a
// pair every candidate of which the bake's gate refused.
export const needsAlternatives = (row: BakedCombo) => row.status === "draft" && row.notes !== undefined && /^(needs alternatives|duplicate of)/.test(row.notes);
export const needsTagConfirmed = (row: BakedCombo) => row.status === "ok" && row.notes !== undefined && /tags proposed/.test(row.notes);

// What to review, in order:
//  1. tags the model proposed for a pair Trysten cleared, to confirm;
//  2. pairs waiting on a pick from alternatives;
//  3. Priority 1: pairs of base things (both of tier 0), the ones players meet first;
//  4. a fixed random sample of the rest, enough to estimate the error rate.
// The held-out pairs are never in it. Everything else is reviewed on use, not now.
export function buildQueue(
  rows: BakedCombo[],
  context: { heldOut: Set<string>; tierOf: (id: string) => number; sample: number },
): QueueItem[] {
  const key = (row: BakedCombo) => comboKey(...row.inputs);
  const live = rows.filter((row) => !context.heldOut.has(key(row)));
  const drafts = live.filter((row) => row.status === "draft");
  const asked = (group: QueueGroup, list: BakedCombo[]) => list.map((row): QueueItem => ({ row, group }));
  const alternatives = drafts.filter(needsAlternatives);
  const rest = drafts.filter((row) => !needsAlternatives(row));
  const first = rest.filter((row) => row.inputs.every((id) => context.tierOf(id) === 0));
  const others = rest
    .filter((row) => !first.includes(row))
    .sort((x, y) => hash(`sample:${key(x)}`) - hash(`sample:${key(y)}`))
    .slice(0, context.sample);
  const byName = (x: BakedCombo, y: BakedCombo) => key(x).localeCompare(key(y));
  return [
    ...asked("confirm-tags", live.filter(needsTagConfirmed).sort(byName)),
    ...asked("alternatives", alternatives.sort(byName)),
    ...asked("priority-1", first.sort(byName)),
    ...asked("sample", others),
  ];
}

export type Decision =
  | { kind: "keep" }
  | { kind: "reject"; failure: BakeFailure; note?: string }
  | { kind: "nothing"; note?: string }
  // A different result. Its description is still to be written (`redescribe`).
  | { kind: "alternative"; name: string; failure?: BakeFailure; note?: string }
  | { kind: "tags"; tags: string[] };

// The row after a key. A row Trysten has looked at is his decision, so its source is "user".
export function decide(row: BakedCombo, decision: Decision): BakedCombo {
  const { correction: _c, failure: _f, notes: _n, ...plain } = row;
  const noted = (note?: string) => (note ? { notes: note } : {});
  const failure = (value?: BakeFailure) => (value ? { failure: value } : {});
  switch (decision.kind) {
    case "keep":
      return { ...plain, status: "ok", source: "user" };
    case "tags":
      return { ...plain, status: "ok", tags: decision.tags, source: "user" };
    case "reject":
      return { ...plain, status: "rejected", failure: decision.failure, ...noted(decision.note), source: "user" };
    case "nothing":
      return { ...plain, status: "nothing", ...noted(decision.note), source: "user" };
    case "alternative":
      return { ...plain, status: "fix", correction: decision.name, ...failure(decision.failure), ...noted(decision.note), source: "user" };
  }
}

export const FAILURE_KEYS: [string, BakeFailure][] = BAKE_FAILURES.map((failure, index) => [String((index + 1) % 10), failure]);

// How far the review has got, for a line at the top of the screen.
export function progressLine(index: number, queue: QueueItem[]): string {
  const groups = new Map<QueueGroup, number>();
  for (const item of queue) groups.set(item.group, (groups.get(item.group) ?? 0) + 1);
  const current = queue[index];
  return `${Math.min(index + 1, queue.length)} of ${queue.length}${current ? ` (${current.group.replace("-", " ")}: ${[...groups].map(([name, count]) => `${count} ${name.replace("-", " ")}`).join(", ")})` : ""}`;
}
