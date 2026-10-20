import { describe, expect, it } from "vitest";
import { chooseHeldOut, planSeed, type ApprovedRow } from "../src/server/bakeSeed";
import type { BakedCombo } from "../src/shared/schema";

const draft = (inputs: [string, string], name: string, more: Partial<BakedCombo> = {}): BakedCombo => ({ inputs, name, description: "Old words, faintly.", tags: ["utility"], wonder: false, sense: 4, reason: "Fits.", status: "draft", ...more });
const row = (inputs: [string, string], result: string | null, more: Partial<ApprovedRow> = {}): ApprovedRow => ({
  key: [...inputs].sort().join("+"),
  inputs,
  result,
  tags: ["utility"],
  status: "approved",
  source: "assistant_read_user_cleared",
  ...more,
});
const canonical = (name: string) => (name.toLowerCase() === "salt water" ? "Saltwater" : name);

describe("choosing the held-out pairs", () => {
  const approved = [
    row(["air", "air"], "Wind"),
    row(["fire", "fire"], "Campfire"),
    row(["water", "water"], "Lake"),
    row(["earth", "earth"], "Soil"),
    row(["crystal", "sand"], "Quartz"),
    row(["crystal", "smoke"], "Quartz"),
    row(["sand", "spirits"], null, { status: "needs_alternatives" }),
  ];

  it("is the same whatever order the file is in, and skips unfinished and shared results", () => {
    const chosen = chooseHeldOut(approved, 3);
    expect(chosen).toHaveLength(3);
    expect(chooseHeldOut([...approved].reverse(), 3)).toEqual(chosen);
    expect(chosen).not.toContain("sand+spirits");
    expect(chosen).not.toContain("crystal+sand");
    expect(chosen).not.toContain("crystal+smoke");
    expect(chooseHeldOut(approved, 99)).toHaveLength(4);
  });
});

describe("seeding the cache", () => {
  const drafts = [draft(["air", "air"], "Wind"), draft(["fire", "fire"], "Campfire"), draft(["metal", "person"], "Knight"), draft(["blood", "feather"], "Phoenix"), draft(["fire", "feather"], "Phoenix"), draft(["sand", "spirits"], "Glass"), draft(["salt", "water"], "Brine")];
  const approved = [
    row(["air", "air"], "Wind"),
    row(["fire", "fire"], "Campfire"),
    row(["metal", "person"], "Armor", { tags: [], source: "user" }),
    row(["fire", "feather"], "Phoenix", { source: "user", note: "duplicate result Phoenix, pick alternative for one" }),
    row(["blood", "feather"], "Phoenix", { source: "user", note: "duplicate result Phoenix, pick alternative for one" }),
    row(["sand", "spirits"], null, { status: "needs_alternatives", source: "user" }),
    row(["salt", "water"], "salt water"),
  ];
  const plan = planSeed({ drafts, approved, heldOut: new Set(["fire+fire"]), canonical });
  const byKey = (key: string) => plan.rows.find((item) => [...item.inputs].sort().join("+") === key)!;

  it("sets an approved pair to fix with its approved name, so nothing is live before it is redescribed", () => {
    expect(byKey("air+air")).toMatchObject({ status: "fix", correction: "Wind", tags: ["utility"], source: "assistant-read" });
    expect(byKey("air+air").notes).toBeUndefined();
    expect(byKey("metal+person")).toMatchObject({ status: "fix", correction: "Armor", tags: [], source: "user", notes: expect.stringContaining("tags") });
    expect(plan.seeded).toEqual(expect.arrayContaining(["air+air", "metal+person", "feather+fire", "salt+water"]));
  });

  it("keeps the game's one spelling of a name", () => {
    expect(byKey("salt+water").correction).toBe("Saltwater");
  });

  it("leaves a held-out pair as it was", () => {
    expect(byKey("fire+fire")).toEqual(drafts[1]);
    expect(plan.heldOut).toEqual(["fire+fire"]);
  });

  it("queues a pair that needs alternatives, and the second of two that share a result the file says to change", () => {
    expect(byKey("sand+spirits")).toMatchObject({ status: "draft", name: "Glass", notes: expect.stringContaining("alternatives") });
    expect(byKey("blood+feather")).toMatchObject({ status: "draft", notes: expect.stringContaining("duplicate of Phoenix") });
    expect(byKey("feather+fire").status).toBe("fix");
    expect(plan.queued.map((item) => item.key).sort()).toEqual(["blood+feather", "sand+spirits"]);
  });

  it("reports a pair with no draft, and leaves the rest alone", () => {
    const missing = planSeed({ drafts: [], approved: [row(["air", "air"], "Wind")], heldOut: new Set(), canonical });
    expect(missing.problems).toEqual(["air+air: no baked draft to build on."]);
    expect(missing.rows).toEqual([]);
  });
});
