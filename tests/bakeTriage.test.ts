import { describe, expect, it } from "vitest";
import { acceptanceChecks, applyVerdicts, flagsFor, nameUses, parseCsv, suggestionFromFlags, toCsv, type TriageRow } from "../src/server/bakeTriage";
import type { BakedCombo } from "../src/shared/schema";
import { data } from "./helpers";

const context = {
  words: data.words,
  banned: data.banned,
  overused: data.overused,
  maxSentences: 2,
  nameCap: 3,
  vouched: (name: string) => name === "Treant",
  nameOf: (id: string) => data.entries.get(id)?.name ?? id,
};
const draft = (inputs: [string, string], name: string, more: Partial<BakedCombo> = {}): BakedCombo => ({ inputs, name, description: "A thing.", tags: [], wonder: false, sense: 4, reason: "Fits.", status: "draft", ...more });
const line = (key: string, more: Partial<TriageRow> = {}): TriageRow => ({
  key,
  pair: key,
  result: "X",
  description: "",
  mark: "4",
  flags: "",
  secondChoice: "",
  modelReason: "",
  weighing: "",
  suggested: "keep",
  suggestedResult: "",
  failure: "",
  yourVerdict: "",
  yourResult: "",
  notes: "",
  ...more,
});

describe("what code can see is wrong with a baked row", () => {
  it("flags a made-up word, a thing from after the steam age, and a name that only says what went in", () => {
    expect(flagsFor(draft(["mud", "crown"], "Mudhat"), 1, context)).toContain("not a real word");
    expect(flagsFor(draft(["air", "metal"], "Airplane"), 1, context)).toContain("after the age of steam");
    expect(flagsFor(draft(["salt", "gold"], "Salted gold"), 1, context)).toContain("only says what went in");
    expect(flagsFor(draft(["tree", "life"], "Treant"), 1, context)).toEqual([]);
    expect(flagsFor(draft(["sand", "water"], "Beach"), 1, context)).toEqual([]);
  });

  it("flags a name used too often, a low mark, worn-out words, and a long description", () => {
    expect(flagsFor(draft(["bat", "tea"], "Fertilizer"), 25, context)).toContain("used 25 times");
    expect(flagsFor(draft(["bat", "tea"], "Fertilizer"), 3, context)).toEqual([]);
    expect(flagsFor(draft(["sand", "water"], "Beach", { sense: 2 }), 1, context)).toContain("low mark");
    expect(flagsFor(draft(["sand", "water"], "Beach", { sense: null }), 1, context)).toContain("unmarked");
    expect(flagsFor(draft(["sand", "water"], "Beach", { description: "It hums faintly." }), 1, context)).toContain("worn-out words");
    expect(flagsFor(draft(["sand", "water"], "Beach", { description: "One. Two. Three." }), 1, context)).toContain("too long");
  });

  it("suggests a verdict from the flags when nobody has given one", () => {
    expect(suggestionFromFlags(["after the age of steam"])).toEqual({ verdict: "reject", failure: "modern" });
    expect(suggestionFromFlags(["not a real word", "low mark"])).toEqual({ verdict: "reject", failure: "not a word" });
    expect(suggestionFromFlags(["low mark"])).toEqual({ verdict: "nothing", failure: "bad logic" });
    expect(suggestionFromFlags(["worn-out words", "used 9 times"])).toEqual({ verdict: "keep" });
  });

  it("counts how many pairs give a name, leaving out rows that are out of play and using a correction when there is one", () => {
    const uses = nameUses([
      draft(["a", "b"], "Cave"),
      draft(["a", "c"], "cave"),
      draft(["a", "d"], "Cave", { status: "rejected" }),
      draft(["a", "e"], "Cave", { status: "nothing" }),
      draft(["a", "f"], "Cave", { status: "fix", correction: "Colony" }),
    ]);
    expect(uses.get("cave")).toBe(2);
    expect(uses.get("colony")).toBe(1);
  });
});

describe("the review file", () => {
  it("survives a trip through a spreadsheet: commas, quotes, and line breaks in cells", () => {
    const rows = [line("sand+water", { description: 'Sand, by the "sea".\nIt is warm.', notes: "fine, really" }), line("air+air", { yourVerdict: "keep" })];
    const text = toCsv(rows);
    expect(text.split("\n")[0]).toContain("YOUR_VERDICT (keep/fix/reject/nothing)");
    expect(parseCsv(text)).toEqual(rows);
    // Windows line endings, a byte-order mark, and columns in another order are all read the same.
    const shuffled = "﻿NOTES,key,YOUR_VERDICT (keep/fix/reject/nothing)\r\nlooks right,air+air,keep\r\n";
    expect(parseCsv(shuffled)[0]).toMatchObject({ key: "air+air", yourVerdict: "keep", notes: "looks right", result: "" });
    expect(() => parseCsv("pair,result\nSand + Water,Beach\n")).toThrow(/no "key" column/);
  });
});

describe("reading verdicts back", () => {
  const drafts = [draft(["sand", "water"], "Beach"), draft(["air", "metal"], "Airplane"), draft(["salt", "crown"], "Sea"), draft(["bat", "tea"], "Bathtub"), draft(["fire", "fire"], "Campfire")];

  it("applies each of the reviewer's verdicts, with the failure and the right answer kept", () => {
    const reviewed = [
      line("sand+water", { yourVerdict: "keep" }),
      line("air+metal", { yourVerdict: "fix", yourResult: "Weathervane", failure: "modern", notes: "no engines in the sky" }),
      line("crown+salt", { yourVerdict: "nothing", failure: "bad logic" }),
      line("bat+tea", { yourVerdict: "reject", failure: "misread ingredient" }),
    ];
    const { rows, counts, problems } = applyVerdicts(drafts, reviewed);
    expect(problems).toEqual([]);
    expect(counts).toEqual({ keep: 1, fix: 1, reject: 1, nothing: 1, untouched: 1 });
    expect(rows[0]).toMatchObject({ name: "Beach", status: "ok" });
    expect(rows[1]).toMatchObject({ name: "Airplane", status: "fix", correction: "Weathervane", failure: "modern", notes: "no engines in the sky" });
    expect(rows[2]).toMatchObject({ status: "nothing", failure: "bad logic" });
    expect(rows[3]).toMatchObject({ status: "rejected", failure: "misread ingredient" });
    expect(rows[4]).toEqual(drafts[4]);
  });

  it("leaves a blank row alone, and takes the suggestion only when asked to", () => {
    const reviewed = [line("sand+water", { suggested: "keep" }), line("air+metal", { suggested: "fix", suggestedResult: "Weathervane", failure: "modern" }), line("bat+tea", { suggested: "reject", yourVerdict: "keep" })];
    const untouched = applyVerdicts(drafts, reviewed);
    expect(untouched.rows[0]!.status).toBe("draft");
    expect(untouched.rows[1]!.status).toBe("draft");
    // The reviewer's word beats the suggestion.
    expect(untouched.rows[3]!.status).toBe("ok");
    const accepted = applyVerdicts(drafts, reviewed, { acceptSuggestions: true });
    expect(accepted.rows[0]!.status).toBe("ok");
    expect(accepted.rows[1]).toMatchObject({ status: "fix", correction: "Weathervane" });
    expect(accepted.rows[3]!.status).toBe("ok");
  });

  it("uses the suggested result for a fix with no result given, and reports what it cannot read", () => {
    const { rows, problems, counts } = applyVerdicts(drafts, [
      line("sand+water", { yourVerdict: "fix", suggestedResult: "Shore" }),
      line("air+metal", { yourVerdict: "fix" }),
      line("crown+salt", { yourVerdict: "maybe" }),
    ]);
    expect(rows[0]).toMatchObject({ status: "fix", correction: "Shore" });
    expect(rows[1]!.status).toBe("draft");
    expect(rows[2]!.status).toBe("draft");
    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toMatch(/no result to fix it to/);
    expect(counts).toMatchObject({ fix: 1, untouched: 4 });
  });
});

describe("the checks a round is held to", () => {
  it("count names over the cap, banned results, long descriptions, and worn-out words among rows in play", () => {
    const rows = [
      ...["b", "c", "d", "e"].map((other) => draft(["a", other], "Cave")),
      draft(["a", "f"], "Airplane"),
      draft(["a", "g"], "Airplane", { status: "rejected" }),
      draft(["a", "h"], "Beach", { description: "One. Two. Three." }),
      draft(["a", "i"], "Shore", { description: "It hums." }),
    ];
    const checks = acceptanceChecks(rows, context);
    expect(checks.rows).toBe(7);
    expect(checks.overCap).toEqual([["cave", 4]]);
    expect(checks.banned).toBe(1);
    expect(checks.tooLong).toBe(1);
    expect(checks.wornShare).toBeCloseTo(1 / 7);
  });
});

describe("the suggestions made for the first bake", () => {
  it("name real pairs, real verdicts, and real failure types, and give every fix a result", async () => {
    const { readFileSync } = await import("node:fs");
    const { BAKE_FAILURES } = await import("../src/shared/schema");
    const suggestions = JSON.parse(readFileSync("data/combo-suggestions.json", "utf8")) as Record<string, { verdict: string; result?: string; failure?: string }>;
    expect(Object.keys(suggestions).length).toBeGreaterThan(300);
    for (const [key, suggestion] of Object.entries(suggestions)) {
      const [a, b] = key.split("+");
      expect(data.entries.has(a!) && data.entries.has(b!), key).toBe(true);
      expect(["keep", "fix", "reject", "nothing"], key).toContain(suggestion.verdict);
      if (suggestion.failure) expect(BAKE_FAILURES as readonly string[], key).toContain(suggestion.failure);
      if (suggestion.verdict === "fix") expect(suggestion.result, key).toBeTruthy();
    }
  });
});
