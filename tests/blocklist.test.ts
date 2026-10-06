import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBlocklist, loadBlocklist, parseBlocklist } from "../src/server/blocklist";

describe("parseBlocklist", () => {
  it("keeps one term per line and skips blanks, comments, and headings", () => {
    expect(parseBlocklist("# note\n\n## PLACES\nOrinfell\n  Sinner's Mile  \n")).toEqual(["Orinfell", "Sinner's Mile"]);
  });
});

describe("createBlocklist", () => {
  const blocklist = createBlocklist(["Ruin", "Sinner's Mile", "bloodstone", "Thread & Timber", "Revel Inc."]);

  it("matches whole words, case-sensitively", () => {
    expect(blocklist.find("The Blade of Ruin")).toEqual(["Ruin"]);
    expect(blocklist.find("It fell to ruin.")).toEqual([]);
    expect(blocklist.find("Ruined walls. Ruinous debts.")).toEqual([]);
    expect(blocklist.find("Ruin's edge")).toEqual(["Ruin"]);
  });

  it("lets a lowercase term also catch its capitalised form", () => {
    expect(blocklist.find("a chip of bloodstone")).toEqual(["bloodstone"]);
    expect(blocklist.find("Bloodstone")).toEqual(["bloodstone"]);
    expect(blocklist.find("BLOODSTONE")).toEqual([]);
  });

  it("matches terms with spaces and punctuation", () => {
    expect(blocklist.find("Sold on Sinner's Mile.")).toEqual(["Sinner's Mile"]);
    expect(blocklist.find("Thread & Timber, by the yard")).toEqual(["Thread & Timber"]);
    expect(blocklist.find("Owned by Revel Inc. since the fire")).toEqual(["Revel Inc."]);
  });
});

describe("loadBlocklist", () => {
  it("gives an empty list when the file is missing", () => {
    const blocklist = loadBlocklist("no-such-file.md");
    expect(blocklist.size).toBe(0);
    expect(blocklist.find("Ruin")).toEqual([]);
  });
});

// Blocklist.md is private and not in git, so this check only runs where the file exists.
describe.skipIf(!existsSync("Blocklist.md"))("the game's own text", () => {
  const blocklist = loadBlocklist("Blocklist.md");
  const files = [
    ...readdirSync("data").filter((name) => name.endsWith(".json")).map((name) => join("data", name)),
    join("data/srd", "materials.json"),
    ...readdirSync("prompts").map((name) => join("prompts", name)),
  ];

  it.each(files)("%s contains no blocklisted term", (path) => {
    expect(blocklist.find(readFileSync(path, "utf8"))).toEqual([]);
  });
});
