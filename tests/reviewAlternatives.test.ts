import { describe, expect, it } from "vitest";
import { createFakeClient } from "../src/server/llm/fake";
import { proposeAlternatives } from "../src/server/reviewAlternatives";
import { comboRules } from "../src/server/combiner";
import { data } from "./helpers";

const give = (names: string[]) => JSON.stringify({ alternatives: names.map((name) => ({ name, why: `${name} from sand and water` })) });
const sand = data.entries.get("sand")!;
const water = data.entries.get("water")!;

describe("alternatives for the reviewer to pick from", () => {
  const rules = comboRules({ data })(sand, water);
  const ask = (answers: string[], avoid = ["Brine"]) => {
    const client = createFakeClient(answers);
    return { client, run: () => proposeAlternatives({ client, log: () => {}, voice: "v", a: sand, b: water, avoid, rules }) };
  };

  it("are the model's names, with those the game cannot use and those turned down left out", async () => {
    const { run, client } = ask([give(["Beach", "Brine", "Mudhat", "Sandbar", "Shore"])]);
    const found = await run();
    expect(found.map((item) => item.name)).toEqual(["Beach", "Sandbar", "Shore"]);
    expect(client.requests[0]!.prompt).toContain("Turned down: Brine.");
    expect(client.requests[0]!.system).toContain("plain compound name first");
  });

  it("are asked for again when too few are usable", async () => {
    const { run, client } = ask([give(["Mudhat", "Sandwater", "Brine", "Zzzz", "Beach"]), give(["Beach", "Sandbar", "Shore", "Dune", "Cove"])]);
    const found = await run();
    expect(found).toHaveLength(5);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]!.prompt).toContain("cannot use");
  });
});
