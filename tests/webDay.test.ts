import { describe, expect, it } from "vitest";
import type { Ledger } from "../src/shared/schema";
import {
  bedOffer,
  noonShare,
  oilText,
  orderCue,
  ordersClosedText,
  phaseName,
  qualityName,
  sunShare,
  sunText,
  takingsTotal,
  visitorCue,
  type Day,
} from "../web/src/day";

function day(changes: Partial<Day> = {}): Day {
  return {
    number: 1,
    sun: 0,
    length: 10,
    noon: 4,
    phase: "morning",
    candles: 3,
    candlesMax: 3,
    nightIn: null,
    canTurnIn: false,
    turnInCandles: 1,
    costs: { visitor: 1, meal: 1, call: 1, hand: 1, enchant: 1, upgrade: 1, build: 2 },
    shiftDone: false,
    tonight: null,
    lastLedger: null,
    ...changes,
  };
}

const afternoon = day({ sun: 5, phase: "afternoon", canTurnIn: true });
const evening = day({ sun: 10, phase: "evening", nightIn: 6 });

describe("the sun meter", () => {
  it("places the sun and the noon mark as shares of the day", () => {
    expect(sunShare(day({ sun: 5 }))).toBe(0.5);
    expect(noonShare(day())).toBe(0.4);
  });

  it("never runs past dusk", () => {
    expect(sunShare(day({ sun: 14 }))).toBe(1);
  });

  it("says in words where the sun is", () => {
    expect(phaseName(afternoon)).toBe("Afternoon");
    expect(sunText(afternoon)).toBe("Day 1, afternoon. The sun is 5 of 10 notches along, and noon is at 4.");
    expect(sunText(day({ ...evening, number: 3 }))).toBe("Day 3, evening. The sun is down.");
  });
});

describe("orderCue", () => {
  it("says orders are waiting when the shift is open", () => {
    expect(orderCue(afternoon, true)).toEqual({ text: "Orders are waiting", ready: true });
  });

  it("counts down to noon in the morning", () => {
    expect(orderCue(day({ sun: 1 }), false).text).toBe("Orders at noon, 3 discoveries off");
    expect(orderCue(day({ sun: 3 }), false).text).toBe("Orders at noon, 1 discovery off");
  });

  it("says the shift is worked, not that noon is still to come", () => {
    expect(orderCue(day({ ...afternoon, shiftDone: true }), false).text).toBe("Today's shift is worked");
  });

  it("says there are none today when it is past noon with nothing open and nothing worked", () => {
    expect(orderCue(afternoon, false).text).toBe("No orders today");
  });
});

describe("ordersClosedText", () => {
  it("gives the reason the board is empty", () => {
    expect(ordersClosedText(day({ sun: 2 }))).toBe("The order board opens at noon, 2 discoveries from now.");
    expect(ordersClosedText(day({ ...afternoon, shiftDone: true }))).toBe("Today's shift is worked. New orders come at noon tomorrow.");
    expect(ordersClosedText(afternoon)).toBe("There are no orders today. New ones come at noon tomorrow.");
  });
});

describe("visitorCue", () => {
  it("holds the visitor until dusk", () => {
    expect(visitorCue(day())).toEqual({ kind: "later", text: "Someone will be at your door this evening." });
    expect(visitorCue(afternoon).kind).toBe("later");
  });

  it("offers them from dusk, with the candle it takes", () => {
    expect(visitorCue(evening)).toEqual({ kind: "sit", text: "Someone is at your door. Sit with them (1 candle)." });
  });

  it("reads the cost from the day, and never assumes it", () => {
    const dear = { ...evening.costs, visitor: 2 };
    expect(visitorCue(day({ ...evening, costs: dear })).text).toBe("Someone is at your door. Sit with them (2 candles).");
    expect(visitorCue(day({ ...evening, costs: dear, candles: 1 })).kind).toBe("spent");
  });

  it("says they will be back when the candles are spent", () => {
    expect(visitorCue(day({ ...evening, candles: 0 }))).toEqual({
      kind: "spent",
      text: "Someone is at your door, but your candles are spent. They will be back tomorrow.",
    });
  });
});

describe("bedOffer", () => {
  it("offers nothing in the morning", () => {
    expect(bedOffer(day(), false)).toBeNull();
  });

  it("offers to call it a day from noon, and says what that costs", () => {
    expect(bedOffer(afternoon, false)).toEqual({
      label: "Call it a day",
      warning: "Calling it a day brings dusk on now, with an evening of 1 candle and not 3.",
    });
    expect(bedOffer(day({ ...afternoon, turnInCandles: 2 }), false)!.warning).toContain("an evening of 2 candles and not 3");
  });

  it("does not say the shift is lost by calling it a day: orders stay open until night", () => {
    expect(bedOffer(afternoon, true)!.warning).not.toMatch(/shift|orders/);
  });

  it("offers bed from dusk, and names the candles that would be given up", () => {
    expect(bedOffer(day({ ...evening, candles: 2 }), false)).toEqual({
      label: "Go to bed",
      warning: "Going to bed ends the day. You have 2 candles left, and they will be gone.",
    });
    expect(bedOffer(day({ ...evening, candles: 1 }), false)!.warning).toContain("1 candle left");
  });

  it("warns that orders still waiting go with the day", () => {
    expect(bedOffer(day({ ...evening, candles: 2 }), true)!.warning).toBe(
      "Going to bed ends the day. You have 2 candles left, and they will be gone. Today's orders have not been worked, and will go with them.",
    );
  });
});

describe("oilText", () => {
  it("counts down only in the evening", () => {
    expect(oilText(day())).toBe("");
    expect(oilText(evening)).toBe("Night falls after 6 more discoveries");
    expect(oilText(day({ ...evening, nightIn: 1 }))).toBe("Night falls after 1 more discovery");
  });
});

describe("the ledger", () => {
  const ledger: Ledger = {
    day: 3,
    fell: "bed",
    takings: [
      { plot: 1, building: "bakery", name: "The Bakery", quality: "great", gold: 12 },
      { plot: 2, building: "inn", name: "The Inn", quality: "meh", gold: 5 },
    ],
    cheer: null,
    brought: [],
    missed: null,
    deed: false,
    lines: [],
  };

  it("names a quality from its id", () => {
    expect(qualityName("great")).toBe("Great");
  });

  it("adds up the night's takings", () => {
    expect(takingsTotal(ledger)).toBe(17);
    expect(takingsTotal({ ...ledger, takings: [] })).toBe(0);
  });
});
