import { describe, expect, it } from "vitest";
import type { BuildingView, DayView, TownView } from "../src/shared/schema";
import { emptyPlot, needText, planBlock, plotCaption, plotStates, plotText, upgradeBlock } from "../web/src/town";

const farm: BuildingView = {
  id: "farm",
  name: "Farm",
  tier: 1,
  quality: "meh",
  takings: 5,
  wants: ["plant", "animal", "liquid"],
  stock: [],
  enchantment: null,
  next: {
    gold: 150,
    level: 3,
    needs: [{ label: "Two things you made, depth 5 or more", met: false, progress: { have: 1, need: 2 } }],
    ready: false,
  },
};

// Three plots owned by a level 1 player whose deeds cover three: a farm, an empty one, and then
// the rest of the street.
function town(changes: Partial<TownView> = {}): TownView {
  return {
    plots: [
      { index: 0, owned: true, price: 0, opensAt: 1, building: farm },
      { index: 1, owned: true, price: 30, opensAt: 1, building: null },
      { index: 2, owned: false, price: 60, opensAt: 1, building: null },
      { index: 3, owned: false, price: 100, opensAt: 2, building: null },
      { index: 4, owned: false, price: 150, opensAt: 3, building: null },
    ],
    deeds: { have: 3, max: 9 },
    cheer: null,
    townsfolk: [],
    plans: [],
    ...changes,
  };
}

const plan = {
  building: "tavern",
  name: "Tavern",
  price: 80,
  candles: 2,
  needs: [
    { label: "Spirits", met: true },
    { label: "Food", met: true },
    { label: "Tree", met: true },
  ],
  ready: true,
};

function day(changes: Partial<DayView> = {}): DayView {
  return {
    number: 2,
    sun: 10,
    length: 10,
    noon: 4,
    phase: "evening",
    candles: 3,
    candlesMax: 3,
    nightIn: 6,
    canTurnIn: false,
    turnInCandles: 1,
    costs: { visitor: 1, meal: 1, call: 1, hand: 1, enchant: 1, upgrade: 1, build: 2 },
    shiftDone: false,
    tonight: null,
    lastLedger: null,
    ...changes,
  };
}

describe("plotStates", () => {
  it("tells a building, an empty plot, the next for sale, a locked one and the rest apart", () => {
    expect(plotStates(town(), 1)).toEqual(["building", "empty", "for-sale", "locked", "locked"]);
  });

  it("offers only the next plot along, and leaves the rest for later", () => {
    expect(plotStates(town(), 3)).toEqual(["building", "empty", "for-sale", "later", "later"]);
  });

  it("locks the next plot when it is past the player's deeds", () => {
    const street = town();
    street.plots[2]!.opensAt = 2;
    expect(plotStates(street, 1)[2]).toBe("locked");
  });
});

describe("plotCaption", () => {
  it("names what is there, the price, or the level that opens it", () => {
    const street = town();
    const states = plotStates(street, 1);
    expect(street.plots.map((plot, index) => plotCaption(plot, states[index]!))).toEqual([
      "Farm",
      "Your plot",
      "60 gold",
      "Level 2",
      "Level 3",
    ]);
  });

  it("says a plot with no price is free", () => {
    expect(plotCaption({ index: 0, owned: false, price: 0, opensAt: 1, building: null }, "for-sale")).toBe("Free");
  });
});

describe("plotText", () => {
  const street = town();
  it("says what the next plot costs, and how much gold is still short", () => {
    expect(plotText(street.plots[2]!, "for-sale", street, 80)).toBe("The next plot along, for 60 gold.");
    expect(plotText(street.plots[2]!, "for-sale", street, 45)).toBe("The next plot along, for 60 gold. You need 15 more.");
  });

  it("says which level opens a plot past the player's deeds", () => {
    expect(plotText(street.plots[3]!, "locked", street, 0)).toBe("Your deeds cover 3 plots. Level 2 brings a deed for this one.");
  });
});

describe("emptyPlot", () => {
  it("finds the first plot the player owns with nothing on it", () => {
    expect(emptyPlot(town())?.index).toBe(1);
    expect(emptyPlot(town({ plots: [town().plots[0]!] }))).toBeNull();
  });
});

describe("needText", () => {
  it("adds the count to a need that counts something", () => {
    expect(needText({ label: "Mud", met: true })).toBe("Mud");
    expect(needText(farm.next!.needs[0]!)).toBe("Two things you made, depth 5 or more (1 of 2)");
  });
});

describe("planBlock", () => {
  it("lets a ready plan be raised in the evening with the gold and the candles", () => {
    expect(planBlock(plan, 80, day(), true)).toBe("");
  });

  it("names the needs still missing before anything else", () => {
    const short = { ...plan, ready: false, needs: [plan.needs[0]!, { label: "Food", met: false }, { label: "Tree", met: false }] };
    expect(planBlock(short, 0, day(), false)).toBe("Still needs Food and Tree.");
  });

  it("asks for an empty plot", () => {
    expect(planBlock(plan, 80, day(), false)).toBe("You need an empty plot to raise it on.");
  });

  it("says how much gold is short", () => {
    expect(planBlock(plan, 50, day(), true)).toBe("You need 30 more gold.");
  });

  it("holds building until dusk, and says what it will take", () => {
    expect(planBlock(plan, 80, day({ phase: "afternoon" }), true)).toBe(
      "Building is evening work, and takes 2 candles. Come back at dusk.",
    );
  });

  it("counts the candles", () => {
    expect(planBlock(plan, 80, day({ candles: 1 }), true)).toBe("This takes 2 candles, and you have 1 left tonight.");
  });

  it("checks only the gold when no day is served", () => {
    expect(planBlock(plan, 80, undefined, true)).toBe("");
  });

  it("never offers a plan the server says is not ready", () => {
    expect(planBlock({ ...plan, ready: false }, 80, day(), true)).toBe("Not ready yet.");
  });
});

describe("upgradeBlock", () => {
  const next = farm.next!;
  it("names the level first", () => {
    expect(upgradeBlock(next, 500, 2, day())).toBe("Opens at level 3.");
  });

  it("then the needs, with how far along they are", () => {
    expect(upgradeBlock(next, 500, 3, day())).toBe("Still needs Two things you made, depth 5 or more (1 of 2).");
  });

  it("then the gold and the candle the day says it costs", () => {
    const met = { ...next, ready: true, needs: [{ label: "Two things you made", met: true }] };
    expect(upgradeBlock(met, 100, 3, day())).toBe("You need 50 more gold.");
    expect(upgradeBlock(met, 150, 3, day({ phase: "morning" }))).toBe("Building is evening work, and takes 1 candle. Come back at dusk.");
    expect(upgradeBlock(met, 150, 3, day())).toBe("");
  });
});
