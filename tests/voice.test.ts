import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { data } from "./helpers";
import { countSentences, createVoiceCheck, tooLong } from "../src/server/voice";

const guide = 'Sample lines\nMud: "Water and Earth, holding hands. They will not let go."\nUse short words like "toast".';
const check = createVoiceCheck(guide);

describe("the voice check", () => {
  it("rejects text that copies a run of words from a sample line", () => {
    expect(check("Water and Earth, holding hands. It settles slowly.")).toMatch(/copies a sample line/);
    expect(check("Silt will not let go of your boots.")).toMatch(/copies a sample line/);
  });

  it("accepts new wording, including single words the samples also use", () => {
    expect(check("Fine river mud that settles slowly and smells of toast.")).toBeNull();
    expect(check("Water and salt, mostly.")).toBeNull();
  });

  it("rejects a description that opens with the thing's own name as a label", () => {
    expect(check("Granite Dust: stone, ground fine.", "Granite Dust")).toMatch(/name and a colon/);
    expect(check("Granite dust settles like a sigh.", "Granite Dust")).toBeNull();
  });

  it("lets every hand-written description through, apart from the sample lines themselves", () => {
    const real = createVoiceCheck(readFileSync("prompts/voice.md", "utf8"));
    const rows: { id: string; name: string; description: string }[] = [
      ...JSON.parse(readFileSync("data/entries.json", "utf8")),
      ...JSON.parse(readFileSync("data/jobs.json", "utf8")),
      ...JSON.parse(readFileSync("data/spell-materials.json", "utf8")),
    ];
    // Mud, Bat guano, and Lightning deliberately use the guide's own words.
    const flagged = rows.filter((row) => real(row.description, row.name) !== null).map((row) => row.id);
    expect(flagged.sort()).toEqual(["bat-guano", "lightning", "mud"]);
  });
});

describe("keeping descriptions short", () => {
  const limit = { maxSentences: 3, maxWords: 50 };

  it("counts sentences, including ones that end in a quotation mark or a question", () => {
    expect(countSentences("Wet ground.")).toBe(1);
    expect(countSentences("Wet ground. It keeps your boots. Why would it not?")).toBe(3);
    expect(countSentences('She said, "No." Then she left.')).toBe(2);
    expect(countSentences("It hums… It should not.")).toBe(2);
  });

  it("allows three sentences and refuses four, or a long ramble in fewer", () => {
    expect(tooLong("One. Two. Three.", limit)).toBeNull();
    expect(tooLong("One. Two. Three. Four.", limit)).toMatch(/too long/);
    expect(tooLong(`${"very ".repeat(60)}long.`, limit)).toMatch(/too long/);
  });

  it("is a limit every hand-written description already keeps", () => {
    const rules = data.balance.generation;
    expect(rules.maxSentences).toBeLessThanOrEqual(3);
    for (const entry of data.entries.values()) expect(tooLong(entry.description, rules), `${entry.id}: ${entry.description}`).toBeNull();
  });
});
