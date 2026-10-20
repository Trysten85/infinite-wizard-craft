import { describe, expect, it } from "vitest";
import { RuleError, type RuleCode as CodeFromCombiner } from "../src/server/combiner";
import { buildGameData, readGameFiles } from "../src/server/gameData";
import {
  DAY_ACTIONS,
  afterAction,
  timeLeft,
  timeMax,
  canTurnIn,
  dayView,
  firstDay,
  isEvening,
  nextDay,
  nightFalls,
  nightIn,
  notchesFor,
  phaseFor,
  refuseTime,
  refuseAction,
  shiftOpen,
  shopOpen,
  spendTime,
  tonightAnnounced,
  tonightComes,
  turnIn,
  visitorDue,
  type DayAction,
  type DayState,
} from "../src/shared/day";
import { NIGHT_REASONS, type DayRules, type RuleCode, type TonightView } from "../src/shared/schema";
import { data } from "./helpers";

// Numbers pinned for the sums below, so retuning config/balance.json does not move these tests.
const costs = { visitor: 1, meal: 1, call: 1, hand: 1, enchant: 1, upgrade: 1, build: 2 };
const access = { visitor: "evening", call: "evening", meal: "evening", hand: "evening", enchant: "evening", upgrade: "evening", build: "evening" } as const;
const limits = { mealsPerDay: 1, handsPerBuilding: 1 };
const rules: DayRules = { length: 10, noon: 4, shiftNotches: 2, time: 3, earlyTime: 1, nightAfter: 6, costs, access, limits, tonight: { fromDay: 4, chance: 0.25 } };

// Plays a run of actions from a starting point.
function play(actions: DayAction[], from: DayState = firstDay()): DayState {
  return actions.reduce((state, action) => afterAction(state, action, rules), from);
}
const discoveries = (count: number): DayAction[] => Array<DayAction>(count).fill("discovery");
const at = (sun: number, more: Partial<DayState> = {}): DayState => ({ ...firstDay(), sun, ...more });
const dusk = () => at(rules.length);

describe("the sun", () => {
  it("makes it morning until noon, afternoon until dusk, and evening from then on", () => {
    expect([0, 3, 4, 9, 10].map((sun) => phaseFor(sun, rules))).toEqual(["morning", "morning", "afternoon", "afternoon", "evening"]);
  });

  it("is moved one notch by a new discovery, and by the shift's notches by a shift", () => {
    expect(notchesFor("discovery", rules)).toBe(1);
    expect(notchesFor("shift", rules)).toBe(2);
    expect(play(["discovery"]).sun).toBe(1);
    expect(play(["shift"]).sun).toBe(2);
    expect(play(discoveries(4)).sun).toBe(4);
  });

  it("is not moved by a pair already known, a pair that makes nothing, buying, gifts, or learning a spell", () => {
    const still: DayAction[] = ["repeat", "no-result", "purchase", "gift", "learn"];
    // Between them, the two lists are every action there is.
    expect([...still, "discovery", "shift"].sort()).toEqual([...DAY_ACTIONS].sort());
    for (const action of still) {
      expect(notchesFor(action, rules), action).toBe(0);
      expect(afterAction(at(3), action, rules), action).toEqual(at(3));
    }
  });

  it("stops at dusk, and crafting on past it is allowed", () => {
    const late = play(discoveries(14));
    expect(late.sun).toBe(10);
    expect(isEvening(late, rules)).toBe(true);
    // A shift worked late in the afternoon cannot push the sun past dusk either.
    expect(afterAction(at(9), "shift", rules).sun).toBe(10);
  });
});

describe("the day's visitor", () => {
  it("is due once a day, and not while one is still unresolved", () => {
    // Dawn of day 2, having finished with day 1's visitor.
    const today = { ...at(0), number: 2 };
    expect(visitorDue(today, 1, ["resolved"])).toBe(true);
    // Today's has been sat with: nobody else comes today.
    expect(visitorDue(today, 2, ["resolved"])).toBe(false);
    // One still waiting or half-written holds the next back, however many days have passed.
    expect(visitorDue(today, 1, ["resolved", "pending"])).toBe(false);
    expect(visitorDue(today, 1, ["writing"])).toBe(false);
    // A player who has met nobody is owed their first.
    expect(visitorDue(at(0), 0, [])).toBe(true);
  });
});

describe("the shift", () => {
  it("opens at noon, to a player who has taken up a job", () => {
    expect(shiftOpen(at(3), rules, true)).toBe(false);
    expect(shiftOpen(at(4), rules, true)).toBe(true);
    expect(shiftOpen(at(4), rules, false)).toBe(false);
  });

  it("is worked once a day, from noon until dusk, and is shut for the evening", () => {
    expect(shiftOpen(at(4), rules, true)).toBe(true);
    expect(shiftOpen(at(9), rules, true)).toBe(true);
    expect(shiftOpen(dusk(), rules, true)).toBe(false);
    const worked = afterAction(at(4), "shift", rules);
    expect(worked).toMatchObject({ sun: 6, shiftDone: true });
    expect(shiftOpen(worked, rules, true)).toBe(false);
    expect(shiftOpen({ ...dusk(), shiftDone: true }, rules, true)).toBe(false);
  });

  it("is not saved up: a shift left unworked is gone with the day", () => {
    const skipped = nextDay(dusk());
    expect(skipped.shiftDone).toBe(false);
    // Dawn of the next day: no shift is open, and noon brings one, not two.
    expect(shiftOpen(skipped, rules, true)).toBe(false);
    const noon = play(discoveries(4), skipped);
    expect(shiftOpen(noon, rules, true)).toBe(true);
    expect(shiftOpen(afterAction(noon, "shift", rules), rules, true)).toBe(false);
  });

  it("can bring dusk on, and worked in the evening burns no midnight oil", () => {
    expect(isEvening(afterAction(at(8), "shift", rules), rules)).toBe(true);
    expect(afterAction(dusk(), "shift", rules)).toMatchObject({ sun: 10, oil: 0, shiftDone: true });
  });
});

describe("time", () => {
  it("are three an evening, and are counted down as they are spent", () => {
    expect(timeMax(dusk(), rules)).toBe(3);
    expect(timeLeft(dusk(), rules)).toBe(3);
    expect(timeLeft(spendTime(dusk(), 1), rules)).toBe(2);
    expect(timeLeft(spendTime(spendTime(dusk(), 1), 2), rules)).toBe(0);
  });

  it("cannot be spent before dusk", () => {
    for (const sun of [0, 4, 9]) expect(refuseTime(at(sun), 1, rules)).toBe("not-evening");
    expect(refuseTime(dusk(), 1, rules)).toBeNull();
  });

  it("are refused when an action costs more than are left", () => {
    expect(refuseTime(dusk(), 3, rules)).toBeNull();
    expect(refuseTime(dusk(), 4, rules)).toBe("no-time");
    const oneLeft = spendTime(dusk(), 2);
    expect(refuseTime(oneLeft, 1, rules)).toBeNull();
    // Raising a new building takes two.
    expect(refuseTime(oneLeft, 2, rules)).toBe("no-time");
    // An action that costs nothing is still an evening action.
    expect(refuseTime(spendTime(dusk(), 3), 0, rules)).toBeNull();
    expect(refuseTime(at(9), 0, rules)).toBe("not-evening");
  });

  it("can be added to by a perk, at any point in the evening", () => {
    const spent = spendTime(dusk(), 3);
    expect(timeLeft(spent, rules)).toBe(0);
    expect(timeMax(spent, rules, 1)).toBe(4);
    expect(timeLeft(spent, rules, 1)).toBe(1);
    expect(refuseTime(spent, 1, rules, 1)).toBeNull();
    expect(nightFalls(spent, rules, 1)).toBeNull();
  });
});

describe("night", () => {
  it("can fall three ways", () => {
    expect([...NIGHT_REASONS].sort()).toEqual(["bed", "midnight-oil", "out-of-time"]);
  });

  it("does not fall before dusk, or in an evening that still has time and oil", () => {
    for (const sun of [0, 4, 9]) expect(nightFalls(at(sun), rules)).toBeNull();
    expect(nightFalls(dusk(), rules)).toBeNull();
    expect(nightFalls(spendTime(dusk(), 2), rules)).toBeNull();
    // So going to bed is the player's own choice, offered from dusk and not before.
    expect(isEvening(dusk(), rules)).toBe(true);
    expect(isEvening(at(9), rules)).toBe(false);
  });

  it("falls when the last of the time is spent", () => {
    expect(nightFalls(spendTime(dusk(), 3), rules)).toBe("out-of-time");
    expect(nightFalls(spendTime(spendTime(spendTime(dusk(), 1), 1), 1), rules)).toBe("out-of-time");
  });

  it("falls by itself after six discoveries past dusk with no time spent: the midnight oil", () => {
    const five = play(discoveries(5), dusk());
    expect(five.oil).toBe(5);
    expect(nightFalls(five, rules)).toBeNull();
    expect(nightIn(five, rules)).toBe(1);
    const six = play(["discovery"], five);
    expect(nightFalls(six, rules)).toBe("midnight-oil");
    expect(nightIn(six, rules)).toBe(0);
    // Unspent time are gone with the day.
    expect(timeLeft(six, rules)).toBe(3);
    expect(timeLeft(nextDay(six), rules)).toBe(3);
    expect(nextDay(six).spent).toBe(0);
  });

  it("does not count the discovery that brought dusk on", () => {
    const justDusk = play(discoveries(10));
    expect(justDusk).toMatchObject({ sun: 10, oil: 0 });
    expect(nightIn(justDusk, rules)).toBe(6);
    expect(play(discoveries(11)).oil).toBe(1);
  });

  it("only burns the midnight oil on new discoveries", () => {
    const busy = play(["repeat", "no-result", "purchase", "gift", "learn", "shift"], dusk());
    expect(busy.oil).toBe(0);
    expect(nightIn(busy, rules)).toBe(6);
  });

  it("starts the midnight-oil count again when time is spent", () => {
    const five = play(discoveries(5), dusk());
    const called = spendTime(five, 1);
    expect(called.oil).toBe(0);
    expect(nightIn(called, rules)).toBe(6);
    const fiveMore = play(discoveries(5), called);
    expect(nightFalls(fiveMore, rules)).toBeNull();
    expect(nightFalls(play(["discovery"], fiveMore), rules)).toBe("midnight-oil");
    // Something that costs no time does not start it again.
    expect(spendTime(five, 0).oil).toBe(5);
  });

  it("counts down only in the evening", () => {
    expect(nightIn(at(9), rules)).toBeNull();
    expect(nightIn(dusk(), rules)).toBe(6);
  });

  it("is followed by dawn on the next day, with nothing carried over", () => {
    const end: DayState = { number: 7, sun: 10, shiftDone: true, early: true, spent: 1, oil: 3 };
    expect(nextDay(end)).toEqual({ number: 8, sun: 0, shiftDone: false, early: false, spent: 0, oil: 0 });
    expect(firstDay()).toEqual({ number: 1, sun: 0, shiftDone: false, early: false, spent: 0, oil: 0 });
  });
});

describe("turning in early", () => {
  it("is offered from noon until dusk", () => {
    expect([0, 3, 4, 9, 10].map((sun) => canTurnIn(at(sun), rules))).toEqual([false, false, true, true, false]);
  });

  it("brings dusk at once, with a short evening and not night", () => {
    const early = turnIn(at(5), rules);
    expect(early).toMatchObject({ sun: 10, early: true, number: 1 });
    expect(isEvening(early, rules)).toBe(true);
    expect(timeMax(early, rules)).toBe(1);
    expect(nightFalls(early, rules)).toBeNull();
    expect(refuseTime(early, 2, rules)).toBe("no-time");
    expect(nightFalls(spendTime(early, 1), rules)).toBe("out-of-time");
  });

  it("gives up the shift, if it was not worked, because the shift closes at dusk", () => {
    expect(shiftOpen(at(5), rules, true)).toBe(true);
    expect(shiftOpen(turnIn(at(5), rules), rules, true)).toBe(false);
  });
});

describe("a whole day", () => {
  it("goes morning, shift, afternoon, evening, night for a player who does it all", () => {
    let day = play(discoveries(4));
    expect(phaseFor(day.sun, rules)).toBe("afternoon");
    day = afterAction(day, "shift", rules);
    day = play(discoveries(4), day);
    expect(day).toMatchObject({ sun: 10, shiftDone: true });
    // Eight discoveries and a shift make a day.
    for (const cost of [1, 1]) {
      expect(refuseTime(day, cost, rules)).toBeNull();
      day = spendTime(day, cost);
      expect(nightFalls(day, rules)).toBeNull();
    }
    day = spendTime(day, 1);
    expect(nightFalls(day, rules)).toBe("out-of-time");
    expect(nextDay(day)).toEqual({ ...firstDay(), number: 2 });
  });

  it("lets a player who only wants to craft do so all night, and costs them the evening alone", () => {
    const day = play(discoveries(16));
    expect(nightFalls(play(discoveries(15)), rules)).toBeNull();
    expect(nightFalls(day, rules)).toBe("midnight-oil");
    expect(day.spent).toBe(0);
  });
});

describe("a one-night happening", () => {
  it("never comes before its first day", () => {
    for (const day of [1, 2, 3]) expect(tonightComes(day, false, 0, rules)).toBe(false);
    expect(tonightComes(4, false, 0, rules)).toBe(true);
  });

  it("comes by its chance", () => {
    expect(tonightComes(9, false, 0.24, rules)).toBe(true);
    expect(tonightComes(9, false, 0.25, rules)).toBe(false);
    expect(tonightComes(9, false, 0.99, rules)).toBe(false);
  });

  it("never comes two days running", () => {
    expect(tonightComes(9, true, 0, rules)).toBe(false);
    // Over a long run with the luckiest rolls, it comes every other day and no more.
    let yesterday = false;
    const came: number[] = [];
    for (let day = 1; day <= 12; day++) {
      const today = tonightComes(day, yesterday, 0, rules);
      if (today) came.push(day);
      expect(today && yesterday).toBe(false);
      yesterday = today;
    }
    expect(came).toEqual([4, 6, 8, 10, 12]);
  });

  it("comes more often to a player the town thinks well of", () => {
    expect(tonightComes(9, false, 0.3, rules)).toBe(false);
    expect(tonightComes(9, false, 0.3, rules, 0.1)).toBe(true);
    expect(tonightComes(9, false, 0.2, rules, -0.1)).toBe(false);
  });

  it("is announced at noon, and kept from the page until then", () => {
    const pedlar: TonightView = { id: "pedlar", name: "A pedlar", line: "Word is, a pedlar comes through tonight.", taken: false, action: "Look through the pedlar's pack" };
    expect([3, 4, 10].map((sun) => tonightAnnounced(at(sun), rules))).toEqual([false, true, true]);
    expect(dayView(at(3), rules, { tonight: pedlar }).tonight).toBeNull();
    expect(dayView(at(4), rules, { tonight: pedlar }).tonight).toEqual(pedlar);
    expect(dayView(dusk(), rules, { tonight: { ...pedlar, taken: true } }).tonight).toMatchObject({ taken: true });
    // A day with no happening shows none at any hour.
    expect(dayView(dusk(), rules).tonight).toBeNull();
    expect(dayView(dusk(), rules, { tonight: null }).tonight).toBeNull();
  });
});

describe("the day as the page sees it", () => {
  it("carries the sun, the phase, the time, and what the player may do", () => {
    expect(dayView(at(5, { number: 3 }), rules)).toEqual({
      number: 3,
      sun: 5,
      length: 10,
      noon: 4,
      phase: "afternoon",
      time: 3,
      timeMax: 3,
      nightIn: null,
      canTurnIn: true,
      turnInTime: 1,
      costs,
      access,
      limits,
      shiftDone: false,
      tonight: null,
      lastLedger: null,
    });
  });

  it("says what turning in early would leave, and what each evening action costs", () => {
    expect(dayView(at(5), rules)).toMatchObject({ timeMax: 3, turnInTime: 1 });
    // A perk's extrtime is kept on a short evening too.
    expect(dayView(at(5), rules, { extraTime: 1 }).turnInTime).toBe(2);
    expect(dayView(at(5), rules, { extraTime: 1 }).turnInTime).toBe(timeMax(turnIn(at(5), rules), rules, 1));
    expect(dayView(dusk(), rules).costs).toEqual({ visitor: 1, meal: 1, call: 1, hand: 1, enchant: 1, upgrade: 1, build: 2 });
    // A cost from the table is what an evening action is refused or let through on.
    const oneLeft = spendTime(dusk(), 2);
    expect(refuseTime(oneLeft, rules.costs.visitor, rules)).toBeNull();
    expect(refuseTime(oneLeft, rules.costs.build, rules)).toBe("no-time");
  });

  it("shows the evening running down", () => {
    const evening = play(discoveries(2), spendTime(dusk(), 1));
    expect(dayView({ ...evening, shiftDone: true }, rules)).toMatchObject({ phase: "evening", time: 2, timeMax: 3, nightIn: 4, canTurnIn: false, shiftDone: true });
    expect(dayView(turnIn(at(4), rules), rules, { extraTime: 1 })).toMatchObject({ time: 2, timeMax: 2 });
  });

  it("carries last night's ledger, so it can be shown again after a reload", () => {
    const ledger = { day: 2, fell: "bed" as const, takings: [], cheer: null, brought: [], missed: null, deed: false, lines: ["You turn in."] };
    expect(dayView(firstDay(), rules, { lastLedger: ledger }).lastLedger).toEqual(ledger);
  });
});

describe("the day's numbers and words in the game files", () => {
  const files = readGameFiles(process.cwd());

  it("are the guide's draft numbers", () => {
    // N2: what the town does by day is free of time and open at any hour. Only the people of
    // the evening, the visitor and a call, wait for dusk and take time.
    expect(data.balance.day).toEqual({
      length: 10,
      noon: 4,
      shiftNotches: 2,
      time: 3,
      earlyTime: 1,
      nightAfter: 6,
      costs: { visitor: 1, call: 1, meal: 0, hand: 0, enchant: 0, upgrade: 0, build: 0 },
      access: { visitor: "evening", call: "evening", meal: "anytime", hand: "anytime", enchant: "anytime", upgrade: "anytime", build: "anytime" },
      limits,
      tonight: { fromDay: 4, chance: 0.25 },
    });
  });

  it("have replaced the three old counters, which are gone from the balance file", () => {
    expect(data.balance.shifts).not.toHaveProperty("every");
    expect(data.balance.shop).not.toHaveProperty("restockEvery");
    expect(data.balance.events).not.toHaveProperty("every");
    expect(data.balance.events).not.toHaveProperty("points");
    for (const band of data.balance.events.repBands) expect(band).not.toHaveProperty("eventEvery");
  });

  it("are refused when noon does not come before dusk", () => {
    const day = { ...files.balance.day, noon: files.balance.day.length };
    expect(() => buildGameData({ ...files, balance: { ...files.balance, day } })).toThrow(/noon must come before/);
  });

  it("have a plain line for dusk, for each way night falls, and for the morning, in the game's voice", () => {
    const text = data.dayText;
    for (const reason of NIGHT_REASONS) expect(text.night[reason].length, reason).toBeGreaterThan(0);
    const lines = [...text.dusk, ...text.turnedIn, ...Object.values(text.night).flat(), ...text.morning, ...text.shopRestocked, ...text.newOrders];
    for (const line of lines) expect(line, line).not.toMatch(/[0-9!]/);
  });
});

describe("refusal codes", () => {
  it("live with the shared types, and the server still reads them from the same place", () => {
    const fromShared: RuleCode[] = ["not-evening", "no-time", "shift-not-ready", "rule"];
    const fromCombiner: CodeFromCombiner[] = fromShared;
    expect(fromCombiner).toHaveLength(4);
    expect(new RuleError("It is not evening yet.", "not-evening").code).toBe("not-evening");
    // The codes the day's own rules hand back are ones a refusal can carry.
    const refused: RuleCode | null = refuseTime(firstDay(), 1, rules);
    expect(refused).toBe("not-evening");
  });
});

describe("the townsfolk and what they say", () => {
  const { people, callingLines } = data.townsfolk;

  it("have enough different names for every job to arrive, none with digits or marks", () => {
    expect(people.length).toBeGreaterThanOrEqual(data.jobs.size);
    expect(new Set(people.map((person) => person.name)).size).toBe(people.length);
    for (const person of people) expect(person.name, person.name).not.toMatch(/[0-9!]/);
  });

  it("have a plain calling line for a job with none of its own, and each line keeps the name's place", () => {
    expect(callingLines.default!.length).toBeGreaterThan(0);
    for (const [job, lines] of Object.entries(callingLines)) {
      if (job !== "default") expect(data.jobs.has(job), job).toBe(true);
      for (const line of lines) {
        expect(line, line).toContain("{name}");
        expect(line, line).not.toMatch(/[0-9!]/);
      }
    }
  });
});

describe("what is open when", () => {
  const open = { ...rules, access: { ...access, meal: "anytime", hand: "anytime", build: "anytime" } } as DayRules;

  it("shuts the shop at dusk and opens it again at dawn", () => {
    expect([0, 4, 9].map((sun) => shopOpen(at(sun), rules))).toEqual([true, true, true]);
    expect(shopOpen(dusk(), rules)).toBe(false);
    expect(shopOpen(nextDay(dusk()), rules)).toBe(true);
  });

  it("lets an anytime action go ahead in the morning without spending anything", () => {
    expect(refuseAction(at(0), "meal", open)).toBeNull();
    expect(refuseAction(at(0), "build", open)).toBeNull();
    expect(refuseAction(dusk(), "hand", open)).toBeNull();
  });

  it("holds an evening action until dusk, and then to the time left", () => {
    expect(refuseAction(at(5), "visitor", open)).toBe("not-evening");
    expect(refuseAction(dusk(), "visitor", open)).toBeNull();
    expect(refuseAction(dusk(), "call", open, 0, 4)).toBe("no-time");
    expect(refuseAction(dusk(), "call", open, 1, 4)).toBeNull();
  });

  it("agrees with the old refusal for an evening action, so nothing changes until a switch is flipped", () => {
    expect(refuseAction(at(5), "build", rules)).toBe("not-evening");
    expect(refuseAction(spendTime(dusk(), 2), "build", rules)).toBe("no-time");
  });

  it("has one limit a day for meals and for hands, in the real data", () => {
    expect(data.balance.day.limits).toEqual({ mealsPerDay: 1, handsPerBuilding: 1 });
  });
});

describe("a ledger saved while the evening's time was candles", () => {
  it("is read with the night falling out of time", async () => {
    const { readLedger } = await import("../src/server/store");
    const old = { day: 3, fell: "last-candle", takings: [], cheer: null, brought: [], missed: null, deed: false, lines: [] };
    expect(readLedger(JSON.stringify(old)).fell).toBe("out-of-time");
    expect(readLedger(JSON.stringify({ ...old, fell: "bed" })).fell).toBe("bed");
  });
});

describe("the evening's time mark", () => {
  it("is one line in data/day-text.json, the same as the page's constant", async () => {
    const { TIME_MARK } = await import("../web/src/timeMark");
    expect(data.dayText.timeMark).toBe(TIME_MARK);
  });
});
