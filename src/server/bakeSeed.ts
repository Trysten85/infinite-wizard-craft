import { z } from "zod";
import { comboKey, slugify, type BakedCombo } from "../shared/schema";

// Seeding the combo cache from the pairs Trysten has approved. Everything here is pure: the tool
// reads and writes the files, and this decides what each approved pair becomes.
//
// An approved pair is not put straight into the game. Its row is set to `fix` with the approved
// name as the `correction`, so nothing goes live until `redescribe` has written a new
// description for it. Old descriptions carry the voice tics round 1 was marked down for.

export const approvedRowSchema = z.strictObject({
  key: z.string().min(1),
  inputs: z.tuple([z.string().min(1), z.string().min(1)]),
  result: z.string().min(1).nullable(),
  tags: z.array(z.string()),
  status: z.enum(["approved", "needs_alternatives"]),
  source: z.enum(["assistant_read_user_cleared", "user"]),
  note: z.string().optional(),
});
export type ApprovedRow = z.infer<typeof approvedRowSchema>;

// The pairs set aside to score a round against. They are never seeded and never shown to the
// model as examples, until the round has been scored.
export const heldOutSchema = z.strictObject({
  note: z.string(),
  keys: z.array(z.string()),
});

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export const keyOf = (row: Pick<ApprovedRow, "inputs">) => comboKey(...row.inputs);

// A fixed, scattered choice of approved pairs: the same every time it is asked, whatever order
// the file is in. Pairs that still need work are never chosen, and neither is a pair whose result
// another approved pair shares, so a held-out pair never shadows a seeded one.
export function chooseHeldOut(approved: ApprovedRow[], count: number): string[] {
  const results = new Map<string, number>();
  for (const row of approved) if (row.result) results.set(slugify(row.result), (results.get(slugify(row.result)) ?? 0) + 1);
  return approved
    .filter((row) => row.status === "approved" && row.result !== null && results.get(slugify(row.result)) === 1)
    .map((row) => ({ key: keyOf(row), at: hash(`held-out:${keyOf(row)}`) }))
    .sort((x, y) => x.at - y.at || x.key.localeCompare(y.key))
    .slice(0, count)
    .map((item) => item.key)
    .sort();
}

export type SeedPlan = {
  rows: BakedCombo[];
  // Set to `fix`, waiting on a new description.
  seeded: string[];
  heldOut: string[];
  // Left as drafts for the pick-from-alternatives review, with why.
  queued: { key: string; why: string }[];
  problems: string[];
};

const SOURCE: Record<ApprovedRow["source"], NonNullable<BakedCombo["source"]>> = {
  assistant_read_user_cleared: "assistant-read",
  user: "user",
};

// What each approved pair becomes in the drafts file. A pair with no draft to build on is
// reported, not invented.
export function planSeed(input: {
  drafts: BakedCombo[];
  approved: ApprovedRow[];
  heldOut: Set<string>;
  // The game's one spelling of a name ("salt water" is Saltwater).
  canonical: (name: string) => string;
}): SeedPlan {
  const plan: SeedPlan = { rows: [...input.drafts], seeded: [], heldOut: [], queued: [], problems: [] };
  const taken = new Set<string>();
  const replace = (key: string, change: (row: BakedCombo) => BakedCombo) => {
    plan.rows = plan.rows.map((row) => (comboKey(...row.inputs) === key ? change(row) : row));
  };
  for (const approved of input.approved) {
    const key = keyOf(approved);
    if (key !== comboKey(...(approved.key.split("+") as [string, string]))) plan.problems.push(`${approved.key}: the key does not match its inputs (${key}).`);
    const draft = plan.rows.find((row) => comboKey(...row.inputs) === key);
    if (!draft) {
      plan.problems.push(`${key}: no baked draft to build on.`);
      continue;
    }
    // A pair already settled, by an earlier seeding or by review, is not seeded again.
    if (draft.status !== "draft") continue;
    if (input.heldOut.has(key)) {
      plan.heldOut.push(key);
      continue;
    }
    if (approved.status === "needs_alternatives" || approved.result === null) {
      plan.queued.push({ key, why: "needs alternatives" });
      replace(key, (row) => ({ ...row, notes: "needs alternatives: pick one of five", source: SOURCE[approved.source] }));
      continue;
    }
    const name = input.canonical(approved.result);
    // Two pairs may not share a result when the file says one of them must be changed.
    if (taken.has(slugify(name)) && /pick alternative/i.test(approved.note ?? "")) {
      plan.queued.push({ key, why: `duplicate of ${name}: pick an alternative` });
      replace(key, (row) => ({ ...row, notes: `duplicate of ${name}: pick an alternative`, source: SOURCE[approved.source] }));
      continue;
    }
    taken.add(slugify(name));
    plan.seeded.push(key);
    replace(key, ({ correction: _c, failure: _f, ...row }) => ({
      ...row,
      status: "fix",
      correction: name,
      // The cleared tags stand. A pair cleared without tags is given the model's, to be confirmed.
      tags: approved.tags,
      notes: approved.tags.length === 0 ? "tags to be proposed by the model, to confirm" : undefined,
      source: SOURCE[approved.source],
    }));
  }
  plan.rows = plan.rows.map((row) => (row.notes === undefined ? (({ notes: _n, ...rest }) => rest)(row) : row));
  return plan;
}
