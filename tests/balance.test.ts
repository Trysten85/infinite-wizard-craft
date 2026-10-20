import { describe, expect, it } from "vitest";
import { overlay, readBalance } from "../src/server/gameData";

describe("laying one balance file over another", () => {
  it("merges objects key by key, and lets anything else replace what is there", () => {
    expect(overlay({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 } })).toEqual({ a: 1, b: { c: 9, d: 3 } });
    expect(overlay({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] });
    expect(overlay({ a: 1 }, { e: 5 })).toEqual({ a: 1, e: 5 });
  });

  it("reads the real numbers with no overlay named", () => {
    expect(readBalance(".", "").day.length).toBe(10);
  });

  it("takes the fast overlay, which still passes the schema, and changes only what it names", () => {
    const real = readBalance(".", "");
    const fast = readBalance(".", "fast");
    expect(fast.day).toMatchObject({ length: 4, noon: 2, tonight: { fromDay: 1, chance: 1 } });
    expect(fast.town.raiseNights).toBe(0);
    expect(fast.events.followUpDays).toBe(1);
    expect(fast.day.time).toBe(real.day.time);
    expect(fast.levels).toEqual(real.levels);
  });

  it("refuses an overlay that does not exist", () => {
    expect(() => readBalance(".", "nope")).toThrow(/balance\.nope\.json does not exist/);
  });
});
