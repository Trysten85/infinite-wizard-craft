import { describe, expect, it } from "vitest";
import type { BuildingView, DayView, GameEntry, TownView } from "../src/shared/schema";
import { data } from "./helpers";
import {
  canStock,
  emptyPlot,
  eveningBlock,
  eveningOffers,
  handBlock,
  needText,
  planBlock,
  plotCaption,
  plotStates,
  plotNeedsJob,
  plotText,
  stockChange,
  stockChangeText,
  tonightAction,
  upgradeBlock,
} from "../web/src/town";

const farm: BuildingView = {
  id: "farm",
  name: "Farm",
  tier: 1,
  quality: "meh",
  takings: 5,
  wants: ["plant", "animal", "liquid"],
  lifts: 0,
  rankBonus: 0,
  enchantBonus: 0,
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

  it("says the first plot waits on a first job, and what it costs", () => {
    const first = { index: 0, owned: false, price: 10, opensAt: 1, building: null };
    expect(plotNeedsJob(first, "for-sale", false)).toBe(true);
    expect(plotNeedsJob(first, "for-sale", true)).toBe(false);
    expect(plotNeedsJob(street.plots[2]!, "for-sale", false)).toBe(false);
    expect(plotText(first, "for-sale", street, 50, false)).toBe(
      "Your first job earns you a place in town. Take one up, and this plot is 10 gold.",
    );
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

// A material or spell that carries some of the farm's wants (plant, animal, liquid), at a tier.
function thing(id: string, tags: string[], tier = 0, kind: GameEntry["kind"] = "material"): GameEntry {
  return { id, name: id, kind, tags, tier } as GameEntry;
}

const shifts = data.balance.shifts;
const hay = thing("hay", ["plant", "animal"]);
const milk = thing("milk", ["liquid"]);
const rock = thing("rock", ["mineral"]);

function shelved(...ids: (string | null)[]): BuildingView {
  return { ...farm, stock: ids.map((id, slot) => ({ slot, entry: id ? { id, name: id } : null })), next: null };
}

const known = new Map([hay, milk, rock].map((entry) => [entry.id, entry]));

describe("stockChange", () => {
  it("calls a thing that covers wants on a bare shelf a better stock, and names what it covers", () => {
    expect(stockChange(shelved(null, null), known, hay, 0, shifts)).toEqual({
      direction: "better",
      covers: ["plant", "animal"],
      from: "meh",
      to: "good",
    });
  });

  it("says a thing the building does not want makes no difference", () => {
    expect(stockChange(shelved(null, null), known, rock, 0, shifts)).toMatchObject({ direction: "same", covers: [] });
  });

  it("calls swapping a good thing for a useless one a worse stock", () => {
    expect(stockChange(shelved("hay", null), known, rock, 0, shifts)).toMatchObject({ direction: "worse", from: "good", to: "meh" });
  });

  it("does not credit a want something else on the shelves already covers", () => {
    expect(stockChange(shelved("hay", null), known, thing("grass", ["plant", "liquid"]), 1, shifts).covers).toEqual(["liquid"]);
  });

  it("moves a thing already on the building, so it is counted once", () => {
    expect(stockChange(shelved("hay", null), known, hay, 1, shifts)).toMatchObject({ direction: "same", covers: ["plant", "animal"] });
  });
});

describe("stockChange with the building's lifts", () => {
  it("names both qualities, counting the lifts already applied", () => {
    // hay covers 2 of 3 wants: Good at no lift, and one applied step makes it Great.
    const lifted = { ...shelved(null, null), lifts: 1, rankBonus: 0 };
    expect(stockChange(lifted, known, hay, 0, shifts)).toMatchObject({ direction: "better", from: "meh", to: "great" });
    expect(stockChangeText(stockChange(lifted, known, hay, 0, shifts))).toBe("Better: Meh to Great. Covers plant and animal.");
  });

  it("lifts a thing that covers nothing from Meh, but never past Perfect", () => {
    const lifted = { ...shelved(null, null), lifts: 2 };
    expect(stockChange(lifted, known, rock, 0, shifts)).toMatchObject({ from: "meh", to: "great", direction: "better" });
    expect(stockChange({ ...lifted, lifts: 9 }, known, rock, 0, shifts)).toMatchObject({ to: "perfect" });
  });

  it("counts the rank bonus", () => {
    // 1 of 3 wants is Meh; with a rank bonus of 0.3 the share is enough for Good.
    const ranked = { ...shelved(null, null), lifts: 0, rankBonus: 0.3 };
    expect(stockChange(ranked, known, milk, 0, shifts)).toMatchObject({ from: "meh", to: "good" });
  });
});

describe("stockChangeText", () => {
  it("says which qualities it moves between, and what it would cover", () => {
    expect(stockChangeText({ direction: "better", covers: ["plant", "animal"], from: "meh", to: "good" })).toBe(
      "Better: Meh to Good. Covers plant and animal.",
    );
    expect(stockChangeText({ direction: "worse", covers: [], from: "great", to: "good" })).toBe("Worse: Great to Good.");
  });

  it("says when the quality stays put", () => {
    expect(stockChangeText({ direction: "same", covers: [], from: "good", to: "good" })).toBe("No difference to its stock.");
    expect(stockChangeText({ direction: "same", covers: ["liquid"], from: "good", to: "good" })).toBe("Covers liquid.");
  });
});

describe("canStock", () => {
  it("takes materials and spells, and never elements or jobs", () => {
    expect(canStock(thing("a", [], 0, "material"))).toBe(true);
    expect(canStock(thing("b", [], 0, "spell"))).toBe(true);
    expect(canStock(thing("c", [], 0, "element"))).toBe(false);
    expect(canStock(thing("d", [], 0, "job"))).toBe(false);
  });
});

describe("handBlock", () => {
  it("says bare shelves would change nothing", () => {
    expect(handBlock(shelved(null, null), day())).toBe("Its shelves are bare, so a hand would change nothing.");
  });

  it("holds a hand until dusk, and names the candle it takes", () => {
    expect(handBlock(shelved("hay"), day({ phase: "morning" }))).toBe(
      "Lending a hand is evening work, and takes 1 candle. Come back at dusk.",
    );
  });

  it("counts the candles", () => {
    expect(handBlock(shelved("hay"), day({ candles: 0 }))).toBe("This takes 1 candle, and you have 0 left tonight.");
  });

  it("allows it in the evening with a candle and a stocked shelf", () => {
    expect(handBlock(shelved("hay"), day())).toBe("");
  });
});

describe("eveningBlock", () => {
  it("holds evening work until dusk, and counts the candles", () => {
    expect(eveningBlock(1, day({ phase: "afternoon" }))).toBe("This is evening work, and takes 1 candle. Come back at dusk.");
    expect(eveningBlock(2, day({ candles: 1 }))).toBe("This takes 2 candles, and you have 1 left tonight.");
    expect(eveningBlock(1, day())).toBe("");
  });

  it("lets a free action through at any hour", () => {
    expect(eveningBlock(0, day({ phase: "morning" }))).toBe("");
  });
});

describe("tonightAction", () => {
  const tonight = (id: string, taken = false) => ({ id, name: id, line: "", taken });
  it("offers asking for the pedlar and the stargazer only, and only until taken", () => {
    expect(tonightAction(tonight("pedlar"))).toBe("Look through the pedlar's pack");
    expect(tonightAction(tonight("stargazer"))).toBe("Ask the stargazer");
    expect(tonightAction(tonight("musician"))).toBeNull();
    expect(tonightAction(tonight("pedlar", true))).toBeNull();
    expect(tonightAction(null)).toBeNull();
  });
});

describe("eveningOffers", () => {
  const tavern: BuildingView = {
    ...farm,
    id: "tavern",
    name: "Tavern",
    stock: [{ slot: 0, entry: { id: "hay", name: "hay" } }],
    next: null,
  };
  const street = town({
    plots: [
      { index: 0, owned: true, price: 0, opensAt: 1, building: tavern },
      { index: 1, owned: true, price: 30, opensAt: 1, building: null },
    ],
    townsfolk: [{ person: 1, job: "farmer", name: "Pim", housed: true, fondness: 0, regular: false }],
    plans: [plan],
  });
  const ids = (offers: ReturnType<typeof eveningOffers>) => offers.map((offer) => offer.id);

  it("lists every evening action that has something to act on, with its cost", () => {
    const offers = eveningOffers(day(), street, { visitor: true, spells: 1, called: 0 });
    expect(ids(offers)).toEqual(["visitor", "call", "meal", "hand", "enchant", "build"]);
    expect(offers.find((offer) => offer.id === "build")).toMatchObject({ cost: "2 candles", ok: true });
  });

  it("leaves out what there is nothing to do with", () => {
    expect(ids(eveningOffers(day(), { ...street, townsfolk: [], plans: [] }, { visitor: false, spells: 0, called: 0 }))).toEqual([
      "meal",
      "hand",
    ]);
    expect(ids(eveningOffers(day(), street, { visitor: false, spells: 0, called: 1 }))).toEqual(["meal", "hand", "build"]);
  });

  it("marks what the candles left cannot pay for", () => {
    const offers = eveningOffers(day({ candles: 1 }), street, { visitor: true, spells: 1, called: 0 });
    expect(offers.map((offer) => [offer.id, offer.ok])).toEqual([
      ["visitor", true],
      ["call", true],
      ["meal", true],
      ["hand", true],
      ["enchant", true],
      ["build", false],
    ]);
  });

  it("includes tonight's happening only when it is taken by asking", () => {
    const withPedlar = day({ tonight: { id: "pedlar", name: "A travelling pedlar", line: "", taken: false } });
    expect(ids(eveningOffers(withPedlar, street, { visitor: false, spells: 0, called: 1 }))).toContain("tonight");
    const musician = day({ tonight: { id: "musician", name: "A musician", line: "", taken: false } });
    expect(ids(eveningOffers(musician, street, { visitor: false, spells: 0, called: 1 }))).not.toContain("tonight");
  });
});
