import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createVoiceCheck } from "../src/server/voice";

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
