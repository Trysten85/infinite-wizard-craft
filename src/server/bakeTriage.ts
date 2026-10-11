import { BAKE_FAILURES, comboKey, slugify, type BakedCombo, type BakeFailure } from "../shared/schema";
import { isBanned, isOnlyIngredients, isRealName, overusedIn, type Banned } from "./names";
import { countSentences } from "./voice";

// The review file for baked pairs: one row a pair, flagged by code, with a suggested verdict and
// room for the reviewer's own. The reviewer's column is the one that counts.

export type Verdict = "keep" | "fix" | "reject" | "nothing";
export const VERDICTS: Verdict[] = ["keep", "fix", "reject", "nothing"];
export type Suggestion = { verdict: Verdict; result?: string; failure?: BakeFailure };

export type TriageRow = {
  key: string;
  pair: string;
  result: string;
  description: string;
  mark: string;
  flags: string;
  secondChoice: string;
  modelReason: string;
  weighing: string;
  suggested: string;
  suggestedResult: string;
  failure: string;
  yourVerdict: string;
  yourResult: string;
  notes: string;
};

const COLUMNS: [keyof TriageRow, string][] = [
  ["key", "key"],
  ["pair", "pair"],
  ["result", "result"],
  ["description", "description"],
  ["mark", "model_mark"],
  ["flags", "flags"],
  ["secondChoice", "model_second_choice"],
  ["modelReason", "model_reason"],
  ["weighing", "model_weighing"],
  ["suggested", "SUGGESTED (keep/fix/reject/nothing)"],
  ["suggestedResult", "SUGGESTED_RESULT"],
  ["failure", "FAILURE"],
  ["yourVerdict", "YOUR_VERDICT (keep/fix/reject/nothing)"],
  ["yourResult", "YOUR_RESULT_IF_FIX"],
  ["notes", "NOTES"],
];

export type TriageContext = {
  words: Set<string>;
  banned: Banned;
  overused: string[];
  maxSentences: number;
  nameCap: number;
  // Names the game vouches for whatever the dictionary says: storybook things, for one.
  vouched: (name: string) => boolean;
  nameOf: (id: string) => string;
};

// What code can see is wrong with a row, without anyone's opinion.
export function flagsFor(row: BakedCombo, uses: number, context: TriageContext): string[] {
  const [a, b] = row.inputs.map(context.nameOf) as [string, string];
  const flags: string[] = [];
  if (uses > context.nameCap) flags.push(`used ${uses} times`);
  if (isBanned(row.name, context.banned)) flags.push("after the age of steam");
  if (context.words.size > 0 && !isRealName(row.name, context.words, context.vouched)) flags.push("not a real word");
  if (isOnlyIngredients(row.name, a, b)) flags.push("only says what went in");
  if (row.sense !== null && row.sense <= 2) flags.push("low mark");
  if (row.sense === null) flags.push("unmarked");
  if (overusedIn(row.description, context.overused)) flags.push("worn-out words");
  if (countSentences(row.description) > context.maxSentences) flags.push("too long");
  return flags;
}

// The verdict code would suggest from the flags alone. A person's suggestion replaces it.
export function suggestionFromFlags(flags: string[]): Suggestion {
  if (flags.includes("after the age of steam")) return { verdict: "reject", failure: "modern" };
  if (flags.includes("not a real word")) return { verdict: "reject", failure: "not a word" };
  if (flags.includes("only says what went in")) return { verdict: "reject", failure: "name pun" };
  if (flags.includes("low mark")) return { verdict: "nothing", failure: "bad logic" };
  return { verdict: "keep" };
}

// How many pairs give each name, among rows that are still in play.
export function nameUses(rows: BakedCombo[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "rejected" || row.status === "nothing") continue;
    const id = slugify(row.correction ?? row.name);
    uses.set(id, (uses.get(id) ?? 0) + 1);
  }
  return uses;
}

const quote = (cell: string) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

export function toCsv(rows: TriageRow[]): string {
  const lines = [COLUMNS.map(([, title]) => quote(title)).join(",")];
  for (const row of rows) lines.push(COLUMNS.map(([field]) => quote(row[field])).join(","));
  return `${lines.join("\n")}\n`;
}

// Reads the review file back. Cells may be quoted, and a quoted cell may hold commas and line
// breaks, as any spreadsheet writes them. Columns are found by their titles, in any order.
export function parseCsv(text: string): TriageRow[] {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') (cell += '"'), index++;
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") (row.push(cell), (cell = ""));
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(cell);
      table.push(row);
      [row, cell] = [[], ""];
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) (row.push(cell), table.push(row));
  const [titles, ...lines] = table.filter((line) => line.some((value) => value.trim() !== ""));
  if (!titles) return [];
  const at = new Map(COLUMNS.map(([field, title]) => [field, titles.findIndex((value) => value.trim() === title)]));
  if ((at.get("key") ?? -1) < 0) throw new Error('The review file has no "key" column.');
  return lines.map((line) => Object.fromEntries(COLUMNS.map(([field]) => [field, (line[at.get(field)!] ?? "").trim()])) as TriageRow);
}

// Applies a reviewed file to the drafts. Each row takes the reviewer's verdict. A row they left
// blank is untouched, unless `acceptSuggestions` is set, in which case the suggestion stands in.
// Returns the new drafts, a count of each verdict applied, and anything that could not be read.
export function applyVerdicts(drafts: BakedCombo[], reviewed: TriageRow[], options: { acceptSuggestions?: boolean } = {}) {
  const byKey = new Map(reviewed.map((row) => [comboKey(...(row.key.split("+") as [string, string])), row]));
  const counts: Record<Verdict | "untouched", number> = { keep: 0, fix: 0, reject: 0, nothing: 0, untouched: 0 };
  const problems: string[] = [];
  const rows = drafts.map((draft): BakedCombo => {
    const row = byKey.get(comboKey(...draft.inputs));
    const theirs = row?.yourVerdict.toLowerCase() ?? "";
    const verdict = (theirs || (options.acceptSuggestions ? (row?.suggested.toLowerCase() ?? "") : "")) as Verdict | "";
    if (!row || verdict === "") return (counts.untouched++, draft);
    if (!VERDICTS.includes(verdict)) return (problems.push(`${row.pair}: "${verdict}" is not keep, fix, reject, or nothing.`), counts.untouched++, draft);
    const failure = (BAKE_FAILURES as readonly string[]).includes(row.failure) ? { failure: row.failure as BakeFailure } : {};
    const notes = row.notes ? { notes: row.notes } : {};
    const { correction: _old, failure: _was, notes: _said, ...plain } = draft;
    counts[verdict]++;
    if (verdict === "keep") return { ...plain, status: "ok", ...notes };
    if (verdict === "fix") {
      const correction = row.yourResult || row.suggestedResult;
      if (!correction) return (problems.push(`${row.pair}: marked fix, with no result to fix it to.`), counts.fix--, counts.untouched++, draft);
      return { ...plain, status: "fix", correction, ...failure, ...notes };
    }
    return { ...plain, status: verdict === "reject" ? "rejected" : "nothing", ...failure, ...notes };
  });
  return { rows, counts, problems };
}

// The checks a round of baking is held to.
export function acceptanceChecks(rows: BakedCombo[], context: Pick<TriageContext, "banned" | "overused" | "maxSentences" | "nameCap">) {
  const live = rows.filter((row) => row.status !== "rejected" && row.status !== "nothing");
  const uses = nameUses(rows);
  const worn = live.filter((row) => overusedIn(row.description, context.overused)).length;
  return {
    rows: live.length,
    overCap: [...uses].filter(([, count]) => count > context.nameCap).sort((x, y) => y[1] - x[1]),
    banned: live.filter((row) => isBanned(row.correction ?? row.name, context.banned)).length,
    tooLong: live.filter((row) => countSentences(row.description) > context.maxSentences).length,
    wornShare: live.length === 0 ? 0 : worn / live.length,
  };
}
