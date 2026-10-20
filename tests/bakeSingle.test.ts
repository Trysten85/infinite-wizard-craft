import { describe, expect, it } from "vitest";
import { createBaker, draftOf } from "../src/server/bake";
import { createFakeClient } from "../src/server/llm/fake";
import { singleSchema } from "../src/server/comboSingle";
import { data } from "./helpers";

const entry = (id: string) => data.entries.get(id)!;
const modelTags = [...data.tags.values()].filter((tag) => tag.assignedBy === "model");

const answer = (more: Record<string, unknown> = {}) =>
  JSON.stringify({
    inputs_summary: "Sand is dry grit. Water is wet and runs.",
    candidates: [
      { name: "Beach", reason: "sand meets water at the shore" },
      { name: "Mud", reason: "wet earth" },
      { name: "Dune", reason: "sand piled by wind" },
    ],
    choice: { name: "Beach", reason: "both are there" },
    result: { name: "Beach", tags: ["mineral"], mode: "ordinary", description: "Sand at the edge of the water, warm by noon." },
    no_result: false,
    no_result_line: "",
    rationale: "Sand and water meet at a beach. Mud only uses the wet half.",
    ...more,
  });
const lean = (more: Record<string, unknown> = {}) => {
  const { inputs_summary: _a, candidates: _b, choice: _c, ...rest } = JSON.parse(answer(more));
  return JSON.stringify(rest);
};
const baker = (answers: string[], way: "single" | "single-lean" = "single", gate?: Parameters<typeof createBaker>[0]["gate"]) => {
  const client = createFakeClient(answers);
  return { client, ...createBaker({ data, voice: "v", client, thinker: null, thinkerEffort: "low", way, gate }) };
};

describe("the single reasoning-first call", () => {
  it("asks for the reasoning fields first, and lays the answer out as the bake's usual record", async () => {
    const { client, bakePair } = baker([answer()]);
    const record = await bakePair(entry("sand"), entry("water"));
    const properties = (client.requests[0]!.jsonSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties)).toEqual(["inputs_summary", "candidates", "choice", "result", "no_result", "no_result_line", "rationale"]);
    expect(record).toMatchObject({ way: "single", failed: null, description: "Sand at the edge of the water, warm by noon.", tags: ["mineral"], keep: "Beach", rationale: expect.stringContaining("Sand and water") });
    expect(record.pick).toMatchObject({ name: "Beach", source: "single call", mark: null });
    expect(record.candidates.map((candidate) => candidate.name)).toEqual(["Beach", "Mud", "Dune"]);
    expect(draftOf(record)).toMatchObject({ name: "Beach", status: "draft", tags: ["mineral"] });
    expect(record.steps.map((step) => step.purpose)).toEqual(["combo-single"]);
  });

  it("drops the reasoning fields in the lean arm", () => {
    expect(Object.keys(singleSchema(modelTags, 3, "single-lean").shape)).toEqual(["result", "no_result", "no_result_line", "rationale"]);
    expect(Object.keys(singleSchema(modelTags, 3, "single").shape)).toHaveLength(7);
  });

  it("works in the lean arm", async () => {
    const { bakePair } = baker([lean()], "single-lean");
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record).toMatchObject({ way: "single-lean", candidates: [], pick: { name: "Beach" } });
  });

  it("sends back a rationale that speaks of only one input, and a tag that is not on offer", async () => {
    const { client, bakePair } = baker([answer({ rationale: "Beaches are lovely places." }), answer({ result: { name: "Beach", tags: ["metal"], mode: "ordinary", description: "Sand at the edge of the water." } }), answer()]);
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record.failed).toBeNull();
    expect(client.requests).toHaveLength(3);
    expect(client.requests[1]!.prompt).toContain("must speak of both");
    expect(client.requests[2]!.prompt).toContain("is not on offer");
  });

  it("keeps the model's no-result as a draft row to confirm, with its gentle line", async () => {
    const { bakePair } = baker([answer({ result: null, no_result: true, no_result_line: "Nothing happens. The kettle looks unimpressed.", candidates: [{ name: "Beach", reason: "x" }, { name: "Mud", reason: "y" }, { name: "Dune", reason: "z" }], choice: { name: "Beach", reason: "x" } })]);
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record.noResult).toBe("Nothing happens. The kettle looks unimpressed.");
    expect(draftOf(record)).toMatchObject({ name: "Nothing", description: "Nothing happens. The kettle looks unimpressed.", status: "draft", source: "model" });
  });

  it("queues a result the gate flags, rather than losing it", async () => {
    const { bakePair } = baker([answer()], "single", () => ["not a real word"]);
    const record = await bakePair(entry("sand"), entry("water"));
    expect(draftOf(record)).toMatchObject({ name: "Beach", notes: "needs alternatives: not a real word" });
  });
});
