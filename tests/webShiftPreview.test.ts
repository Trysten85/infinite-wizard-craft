import { describe, expect, it } from "vitest";
import { loadGameData } from "../src/server/gameData";
import { previewRange } from "../src/shared/shifts";
import { previewText } from "../web/src/shiftPreview";

const rules = loadGameData(process.cwd()).balance.shifts;
const order = { tags: ["metal", "protection"], tier: 0 };
const input = (tags: string[], tier = 0) => ({ tags, tier });

describe("previewText", () => {
  it("names the likeliest result with the range luck allows", () => {
    const range = previewRange(order, { base: input(["metal"]), method: input([]) }, "apprentice", rules);
    expect(previewText(range, rules)).toBe("Likely Good (Meh to Great)");
  });

  it("stops the range at the best and worst there are", () => {
    const best = previewRange(order, { base: input(["metal"]), method: input(["protection"]) }, "apprentice", rules);
    expect(previewText(best, rules)).toBe("Likely Perfect (Great to Perfect)");
    const worst = previewRange({ tags: ["metal"], tier: 3 }, { base: input([]), method: input([]) }, "apprentice", rules);
    expect(previewText(worst, rules)).toBe("Likely Meh (Meh to Good)");
  });

  it("gives no range when luck can't move the result", () => {
    const steady = { ...rules, variance: { down: 0, up: 0 } };
    const range = previewRange(order, { base: input(["metal"]), method: input(["protection"]) }, "apprentice", steady);
    expect(previewText(range, steady)).toBe("Likely Perfect");
  });
});
