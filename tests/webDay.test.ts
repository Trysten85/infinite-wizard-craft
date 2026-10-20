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
  tonightNews,
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
    time: 3,
    timeMax: 3,
    nightIn: null,
    canTurnIn: false,
    turnInTime: 1,
    costs: { visitor: 1, meal: 1, call: 1, hand: 1, enchant: 1, upgrade: 1, build: 2 },
    access: { visitor: "evening", call: "evening", meal: "evening", hand: "evening", enchant: "evening", upgrade: "evening", build: "evening" },
    limits: { mealsPerDay: 1, handsPerBuilding: 1 },
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

  it("says the board closed at dusk in the evening", () => {
    expect(orderCue(evening, false).text).toBe("The order board closed at dusk");
  });
});

describe("ordersClosedText", () => {
  it("gives the reason the board is empty", () => {
    expect(ordersClosedText(day({ sun: 2 }))).toBe("The order board opens at noon, 2 discoveries from now.");
    expect(ordersClosedText(day({ ...afternoon, shiftDone: true }))).toBe("Today's shift is worked. New orders come at noon tomorrow.");
    expect(ordersClosedText(afternoon)).toBe("There are no orders today. New ones come at noon tomorrow.");
    expect(ordersClosedText(evening)).toBe("The order board closed at dusk. New orders come at noon tomorrow.");
  });
});

describe("tonightNews", () => {
  const tonight = { id: "pedlar", name: "The pedlar", line: "A pedlar sets down a pack.", taken: false, action: "Look through the pedlar's pack" };
  it("tells the line once for a day, and not when taken or absent", () => {
    const today = day({ ...afternoon, tonight });
    expect(tonightNews(today, null)).toBe("A pedlar sets down a pack.");
    expect(tonightNews(today, today.number)).toBeNull();
    expect(tonightNews(day({ ...afternoon, tonight: { ...tonight, taken: true } }), null)).toBeNull();
    expect(tonightNews(afternoon, null)).toBeNull();
  });
});

describe("visitorCue", () => {
  it("holds the visitor until dusk", () => {
    expect(visitorCue(day(), "door")).toEqual({ kind: "later", text: "Someone will be at your door this evening." });
    expect(visitorCue(afternoon, "door").kind).toBe("later");
  });

  it("offers them from dusk, with the time it takes", () => {
    expect(visitorCue(evening, "door")).toEqual({ kind: "sit", text: "Someone is at your door. Sit with them (1 ⌛)." });
  });

  it("says the Tavern when the visitor sits there", () => {
    expect(visitorCue(evening, "tavern").text).toBe("Someone is at the Tavern. Sit with them (1 ⌛).");
    expect(visitorCue(afternoon, "tavern").text).toBe("Someone will be at the Tavern this evening.");
    expect(visitorCue(day({ ...evening, time: 0 }), "tavern").text).toContain("at the Tavern, but you have no ⌛ left tonight");
  });

  it("reads the cost from the day, and never assumes it", () => {
    const dear = { ...evening.costs, visitor: 2 };
    expect(visitorCue(day({ ...evening, costs: dear }), "door").text).toBe("Someone is at your door. Sit with them (2 ⌛).");
    expect(visitorCue(day({ ...evening, costs: dear, time: 1 }), "door").kind).toBe("spent");
  });

  it("says they will be back when the time are spent", () => {
    expect(visitorCue(day({ ...evening, time: 0 }), "door")).toEqual({
      kind: "spent",
      text: "Someone is at your door, but you have no ⌛ left tonight. They will be back tomorrow.",
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
      warning: "Calling it a day brings dusk on now, with an evening of 1 ⌛ and not 3 ⌛.",
    });
    expect(bedOffer(day({ ...afternoon, turnInTime: 2 }), false)!.warning).toContain("an evening of 2 ⌛ and not 3 ⌛");
  });

  it("warns that calling it a day closes the order board on a shift still waiting", () => {
    expect(bedOffer(afternoon, true)!.warning).toBe(
      "Calling it a day brings dusk on now, with an evening of 1 ⌛ and not 3 ⌛. Today's orders have not been worked, and the order board closes at dusk.",
    );
    expect(bedOffer(afternoon, false)!.warning).not.toMatch(/orders/);
  });

  it("offers bed from dusk, and names the time that would be given up", () => {
    expect(bedOffer(day({ ...evening, time: 2 }), false)).toEqual({
      label: "Go to bed",
      warning: "Going to bed ends the day. You have 2 ⌛ left, and it will be gone.",
    });
    expect(bedOffer(day({ ...evening, time: 1 }), false)!.warning).toContain("1 ⌛ left");
  });

  it("says nothing of orders at bedtime: the board closed at dusk", () => {
    expect(bedOffer(day({ ...evening, time: 2 }), true)!.warning).not.toMatch(/orders/);
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
