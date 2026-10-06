import { describe, expect, it } from "vitest";
import { createFakeClient } from "../src/server/llm/fake";
import { generateValidated, GenerationError } from "../src/server/llm/generate";
import type { ModelCall } from "../src/server/store";
import { comboDraftSchema, type Tag } from "../src/shared/schema";

const vocabulary: Tag[] = [
  { id: "mineral", group: "material", meaning: "x", assignedBy: "model" },
  { id: "liquid", group: "material", meaning: "x", assignedBy: "model" },
  { id: "rare", group: "material", meaning: "x", assignedBy: "author" },
];
const schema = comboDraftSchema(vocabulary);
const draft = (tags: string[], missingTag: string | null = null) =>
  JSON.stringify({ name: "Ash", description: "What the fire leaves.", tags, missingTag });
const good = draft(["mineral"]);

function run(responses: (string | Error)[], reject?: (v: { name: string }) => string | null) {
  const client = createFakeClient(responses);
  const calls: ModelCall[] = [];
  const result = generateValidated(client, (call) => calls.push(call), {
    purpose: "test",
    system: "s",
    prompt: "p",
    schema,
    reject,
    maxAttempts: 3,
    temperature: 0,
  });
  return { client, calls, result };
}

describe("generateValidated", () => {
  it("returns valid output on the first try and logs the call", async () => {
    const { calls, result } = run([good]);
    expect((await result).name).toBe("Ash");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ purpose: "test", model: "fake", ok: true, promptTokens: 10, completionTokens: 5 });
  });

  it("rerolls when the output is not JSON, breaks the schema, or uses an unknown tag", async () => {
    const { calls, result } = run(["not json", draft(["sparkly"]), good]);
    expect((await result).name).toBe("Ash");
    expect(calls.map((c) => c.ok)).toEqual([false, false, true]);
  });

  it("rerolls when the model uses an author-only tag", async () => {
    const { calls, result } = run([draft(["rare"]), good]);
    expect((await result).tags).toEqual(["mineral"]);
    expect(calls.map((c) => c.ok)).toEqual([false, true]);
  });

  it("accepts no tags with a missing-tag hint, and offers the model only its own tags", async () => {
    const { client, result } = run([draft([], "vapor")]);
    expect(await result).toMatchObject({ tags: [], missingTag: "vapor" });
    const offered = JSON.stringify(client.requests[0]!.jsonSchema);
    expect(offered).toContain("mineral");
    expect(offered).not.toContain("rare");
  });

  it("rerolls when the model returns more than five tags", async () => {
    const { calls, result } = run([draft(["mineral", "liquid", "mineral", "liquid", "mineral", "liquid"]), good]);
    await result;
    expect(calls.map((c) => c.ok)).toEqual([false, true]);
  });

  it("rerolls when a game rule rejects the output, and tells the model why", async () => {
    const taken = JSON.stringify({ name: "Death", description: "x", tags: [], missingTag: null });
    const { client, result } = run([taken, good], (v) => (v.name === "Death" ? "Death is taken." : null));
    expect((await result).name).toBe("Ash");
    expect(client.requests[1]!.prompt).toContain("Death is taken.");
  });

  it("rerolls when the model call itself fails", async () => {
    const { calls, result } = run([new Error("connection refused"), good]);
    expect((await result).name).toBe("Ash");
    expect(calls[0]).toMatchObject({ ok: false, error: "connection refused" });
  });

  it("gives up after the maximum number of attempts", async () => {
    const { calls, result } = run(["bad", "bad", "bad", good]);
    await expect(result).rejects.toThrow(GenerationError);
    expect(calls).toHaveLength(3);
  });
});
