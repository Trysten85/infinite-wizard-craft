import { describe, expect, it } from "vitest";
import { buildGameData, readGameFiles } from "../src/server/gameData";
import { chosenFrom, optionsFor, orderText, orderTierFor, resultLine, slotTags, stockOrder } from "../src/server/shifts/orders";
import { QUALITIES, RANKS, SHIFT_SLOTS, type GameEntry, type RankId, type ShiftOption, type ShiftRules } from "../src/shared/schema";
import { coveredTags, matchScore, meetsTier, payFor, previewRange, qualityFor, rankFor, rankView, resolveQuality, type ShiftPick } from "../src/shared/shifts";
import { data, seeded } from "./helpers";

// Numbers pinned for the sums below, so retuning config/balance.json does not move these tests.
const rules: ShiftRules = {
  board: 3,
  tierBonus: 0.15,
  qualities: [
    { id: "meh", name: "Meh", from: 0, gold: 0.6, xp: 0.6, rep: 0 },
    { id: "good", name: "Good", from: 0.5, gold: 1, xp: 1, rep: 0 },
    { id: "great", name: "Great", from: 0.8, gold: 1.4, xp: 1.3, rep: 1 },
    { id: "perfect", name: "Perfect", from: 1.1, gold: 1.8, xp: 1.6, rep: 2 },
  ],
  variance: { down: 0.15, up: 0.15 },
  pay: { goldByTier: [10, 18, 28, 40], xpByTier: [10, 15, 20, 25] },
  ranks: [
    { id: "apprentice", name: "Apprentice", shifts: 0, score: null, bonus: 0, orderTags: 2 },
    { id: "journeyman", name: "Journeyman", shifts: 8, score: null, bonus: 0.05, orderTags: 3 },
    { id: "master", name: "Master", shifts: 20, score: null, bonus: 0.1, orderTags: 3 },
  ],
};

const input = (tags: string[], tier = 0) => ({ tags, tier });
const hinge = { tags: ["metal", "forging"], tier: 1 };
const scrapAndHammer: ShiftPick = { base: input(["metal"]), method: input(["forging"]) };
// A roll in the middle leaves the result where the score put it.
const STEADY = 0.5;

describe("a shift's score", () => {
  it("is the share of the order's tags the chosen inputs cover between them", () => {
    expect(coveredTags(hinge, scrapAndHammer)).toEqual(["metal", "forging"]);
    expect(matchScore(hinge, scrapAndHammer, "apprentice", rules)).toBe(1);
    expect(matchScore(hinge, { base: input(["metal"]), method: input(["energy"]) }, "apprentice", rules)).toBe(0.5);
    expect(matchScore(hinge, { base: input(["plant"]), method: input(["energy"]) }, "apprentice", rules)).toBe(0);
    // The Touch counts too, and a tag covered twice counts once.
    expect(matchScore(hinge, { base: input(["metal"]), method: input(["metal"]), touch: input(["forging"]) }, "apprentice", rules)).toBe(1);
    expect(matchScore({ tags: ["metal", "forging", "liquid"], tier: 1 }, scrapAndHammer, "apprentice", rules)).toBeCloseTo(2 / 3);
  });

  it("gains a bonus when the best Base or Touch is as fine as the order asks", () => {
    const fineBase: ShiftPick = { base: input(["metal"], 1), method: input(["forging"]) };
    const fineTouch: ShiftPick = { ...scrapAndHammer, touch: input(["rare"], 2) };
    expect(meetsTier(hinge, scrapAndHammer)).toBe(false);
    expect(matchScore(hinge, fineBase, "apprentice", rules)).toBeCloseTo(1.15);
    expect(matchScore(hinge, fineTouch, "apprentice", rules)).toBeCloseTo(1.15);
    // A method is a way of working, not a thing, so its tier is never looked at.
    expect(meetsTier(hinge, { base: input(["metal"]), method: input(["forging"], 3) })).toBe(false);
    // An order of the plainest tier is met by anything.
    expect(meetsTier({ ...hinge, tier: 0 }, scrapAndHammer)).toBe(true);
  });

  it("gains a bonus with rank", () => {
    const scores = RANKS.map((rank) => matchScore(hinge, scrapAndHammer, rank, rules));
    expect(scores[0]).toBe(1);
    expect(scores[1]).toBeCloseTo(1.05);
    expect(scores[2]).toBeCloseTo(1.1);
  });
});

describe("a shift's quality", () => {
  it("steps up with the score", () => {
    expect([0, 0.49, 0.5, 0.79, 0.8, 1.09, 1.1, 5].map((score) => qualityFor(score, rules))).toEqual(["meh", "meh", "good", "good", "great", "great", "perfect", "perfect"]);
  });

  it("counts a score that lands on a threshold after adding fractions", () => {
    // A full match by a master: 1 + 0.1, which a computer makes very slightly less than 1.1.
    expect(resolveQuality(hinge, scrapAndHammer, "master", STEADY, rules)).toBe("perfect");
    expect(qualityFor(0.1 + 0.2 + 0.2, rules)).toBe("good");
  });

  it("is Great for a full match, and Perfect once the tier is met as well", () => {
    expect(resolveQuality(hinge, scrapAndHammer, "apprentice", STEADY, rules)).toBe("great");
    expect(resolveQuality(hinge, { base: input(["metal"], 1), method: input(["forging"]) }, "apprentice", STEADY, rules)).toBe("perfect");
    expect(resolveQuality(hinge, { base: input(["metal"], 1), method: input(["energy"]) }, "apprentice", STEADY, rules)).toBe("good");
    expect(resolveQuality(hinge, { base: input(["plant"]), method: input(["energy"]) }, "apprentice", STEADY, rules)).toBe("meh");
  });

  it("moves at most one step with luck: down on a low roll, up on a high one", () => {
    expect(resolveQuality(hinge, scrapAndHammer, "apprentice", 0.14, rules)).toBe("good");
    expect(resolveQuality(hinge, scrapAndHammer, "apprentice", 0.15, rules)).toBe("great");
    expect(resolveQuality(hinge, scrapAndHammer, "apprentice", 0.84, rules)).toBe("great");
    expect(resolveQuality(hinge, scrapAndHammer, "apprentice", 0.85, rules)).toBe("perfect");
  });

  it("never falls below Meh or rises above Perfect", () => {
    const hopeless: ShiftPick = { base: input(["plant"]), method: input(["energy"]) };
    const flawless: ShiftPick = { base: input(["metal"], 3), method: input(["forging"]) };
    expect(resolveQuality(hinge, hopeless, "apprentice", 0, rules)).toBe("meh");
    expect(resolveQuality(hinge, flawless, "master", 0.999, rules)).toBe("perfect");
  });

  it("does not move at all when luck is switched off", () => {
    const calm = { ...rules, variance: { down: 0, up: 0 } };
    for (const roll of [0, 0.5, 0.999]) expect(resolveQuality(hinge, scrapAndHammer, "apprentice", roll, calm)).toBe("great");
    expect(previewRange(hinge, scrapAndHammer, "apprentice", calm)).toEqual({ low: "great", likely: "great", high: "great" });
  });
});

describe("the preview", () => {
  it("names the likeliest result with one step either side", () => {
    expect(previewRange(hinge, scrapAndHammer, "apprentice", rules)).toEqual({ low: "good", likely: "great", high: "perfect" });
    expect(previewRange(hinge, { base: input(["plant"]), method: input(["energy"]) }, "apprentice", rules)).toEqual({ low: "meh", likely: "meh", high: "good" });
  });

  it("always brackets the real result, whatever is chosen and however the roll falls", () => {
    const random = seeded(7);
    const tagPool = ["metal", "forging", "liquid", "energy", "plant", "rare"];
    const someTags = () => tagPool.filter(() => random() < 0.4);
    for (let round = 0; round < 300; round++) {
      const ask = { tags: someTags(), tier: Math.floor(random() * 4) };
      const pick: ShiftPick = { base: input(someTags(), Math.floor(random() * 4)), method: input(someTags()), touch: random() < 0.5 ? input(someTags(), Math.floor(random() * 4)) : null };
      const rank = RANKS[Math.floor(random() * RANKS.length)]!;
      const { low, likely, high } = previewRange(ask, pick, rank, rules);
      const got = QUALITIES.indexOf(resolveQuality(ask, pick, rank, random(), rules));
      expect(got).toBeGreaterThanOrEqual(QUALITIES.indexOf(low));
      expect(got).toBeLessThanOrEqual(QUALITIES.indexOf(high));
      expect(QUALITIES.indexOf(high) - QUALITIES.indexOf(low)).toBeLessThanOrEqual(2);
      expect(resolveQuality(ask, pick, rank, STEADY, rules)).toBe(likely);
    }
  });
});

describe("a shift's pay", () => {
  it("scales the order's base pay by quality, and still pays for a Meh result", () => {
    expect(QUALITIES.map((quality) => payFor(hinge, quality, rules))).toEqual([
      { gold: 11, xp: 9, rep: 0 },
      { gold: 18, xp: 15, rep: 0 },
      { gold: 25, xp: 20, rep: 1 },
      { gold: 32, xp: 24, rep: 2 },
    ]);
  });

  it("is higher for a more demanding order, and a tier past the table takes the last row", () => {
    const good = [0, 1, 2, 3, 9].map((tier) => payFor({ tags: [], tier }, "good", rules).gold);
    expect(good).toEqual([10, 18, 28, 40, 40]);
  });
});

describe("rank", () => {
  it("comes from shifts done in the job, and is never lost", () => {
    expect([0, 7, 8, 19, 20, 500].map((done) => rankFor(done, rules).id)).toEqual(["apprentice", "apprentice", "journeyman", "journeyman", "master", "master"]);
    let last = 0;
    for (let done = 0; done <= 60; done++) {
      const now = RANKS.indexOf(rankFor(done, rules).id);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it("is shown with how far the next one is", () => {
    expect(rankView(3, rules)).toEqual({ id: "apprentice", name: "Apprentice", shifts: 3, next: { name: "Journeyman", shifts: 8 } });
    expect(rankView(8, rules)).toEqual({ id: "journeyman", name: "Journeyman", shifts: 8, next: { name: "Master", shifts: 20 } });
    expect(rankView(25, rules)).toEqual({ id: "master", name: "Master", shifts: 25, next: null });
  });
});

describe("the shift numbers in the balance file", () => {
  const live = data.balance.shifts;

  it("pay by quality as the jobs guide sets out", () => {
    expect(live.qualities.map(({ id, gold, xp, rep }) => ({ id, gold, xp, rep }))).toEqual([
      { id: "meh", gold: 0.6, xp: 0.6, rep: 0 },
      { id: "good", gold: 1, xp: 1, rep: 0 },
      { id: "great", gold: 1.4, xp: 1.3, rep: 1 },
      { id: "perfect", gold: 1.8, xp: 1.6, rep: 2 },
    ]);
  });

  it("keep a shift's XP small beside a level, so discoveries and quests stay the way to level", () => {
    const best = Math.max(...live.pay.xpByTier) * Math.max(...live.qualities.map((quality) => quality.xp));
    expect(best).toBeLessThanOrEqual(data.balance.levels.xpStep * 0.05);
  });

  it("do not ask for a build score yet, since score is not built", () => {
    expect(live.ranks.map((rank) => rank.score)).toEqual([null, null, null]);
  });
});

// Everything in the game, held by a player at the level cap who has learned every spell.
const everything = { discovered: [...data.entries.values()], learned: [...data.entries.values()].filter((entry) => entry.kind === "spell").map((entry) => entry.id), level: data.balance.levels.cap };
const nothing = { discovered: [] as GameEntry[], learned: [] as string[], level: 1 };
const skins = [...data.jobSkins.values()];

describe("job skins", () => {
  it("exist for every job", () => {
    expect(skins.map((skin) => skin.job).sort()).toEqual([...data.jobs.keys()].sort());
  });

  it("give every job a new method at Journeyman and a second Touch at Master", () => {
    for (const skin of skins) {
      expect(skin.method.staples.filter((staple) => staple.rank === "journeyman"), skin.job).toHaveLength(1);
      expect(skin.method.staples.filter((staple) => !staple.rank).length, skin.job).toBeGreaterThanOrEqual(3);
      expect(skin.touch.staples.filter((staple) => staple.rank === "master"), skin.job).toHaveLength(1);
      expect(skin.touch.staples.filter((staple) => !staple.rank).length, skin.job).toBeGreaterThanOrEqual(1);
    }
  });

  it("are written in the game's voice: no digits, no exclamation marks", () => {
    const lines = [...skins.flatMap((skin) => [skin.flavor, ...skin.subjects, ...SHIFT_SLOTS.flatMap((slot) => [skin[slot].name, ...skin[slot].staples.map((staple) => staple.name)])]), ...Object.values(data.shiftText.tagWords), ...Object.values(data.shiftText.results).flat()];
    for (const line of lines) expect(line, line).not.toMatch(/[0-9!]/);
  });
});

describe("what a player may choose from", () => {
  it("always includes the job's own staples, so nobody is stuck with an empty slot", () => {
    for (const skin of skins) {
      const options = optionsFor(data, skin, { ...nothing, rank: "apprentice" });
      expect(options.base.length, skin.job).toBeGreaterThanOrEqual(1);
      expect(options.method.length, skin.job).toBeGreaterThanOrEqual(3);
      expect(options.touch.length, skin.job).toBeGreaterThanOrEqual(1);
      for (const option of Object.values(options).flat()) expect(option).toMatchObject({ own: true, tier: 0, id: expect.stringMatching(/^staple:/) });
    }
  });

  it("opens more of the job's own with rank", () => {
    const smith = data.jobSkins.get("blacksmith")!;
    const names = (rank: RankId, slot: "method" | "touch") => optionsFor(data, smith, { ...nothing, rank })[slot].map((option) => option.name);
    expect(names("apprentice", "method")).toEqual(["Heat", "Hammer", "Quench"]);
    expect(names("journeyman", "method")).toEqual(["Heat", "Hammer", "Quench", "Fold"]);
    expect(names("journeyman", "touch")).toEqual(["A good polish"]);
    expect(names("master", "touch")).toEqual(["A good polish", "A maker's mark"]);
  });

  it("adds the player's own things to the slot they fit, finest first", () => {
    const smith = data.jobSkins.get("blacksmith")!;
    const have = ["gold", "iron", "sand", "tree", "tea"].map((id) => data.entries.get(id)!);
    const options = optionsFor(data, smith, { ...nothing, discovered: have, rank: "apprentice" });
    const mine = options.base.filter((option) => !option.own);
    // Tree and Tea are neither metal nor mineral, so a smith has no use for them.
    expect(mine.map((option) => option.id).sort()).toEqual(["gold", "iron", "sand"]);
    expect(mine.map((option) => option.tier)).toEqual([...mine.map((option) => option.tier)].sort((a, b) => b - a));
    expect(options.base[0]).toMatchObject({ own: true, name: "Scrap iron" });
    expect(mine.find((option) => option.id === "gold")).toEqual({ id: "gold", name: "Gold", tags: data.entries.get("gold")!.tags, tier: data.entries.get("gold")!.tier, own: false });
    // A method is a way of working. Nothing of the player's goes there.
    expect(options.method.every((option) => option.own)).toBe(true);
  });

  it("only offers a spell the player has learned and is of a level to cast", () => {
    const wizard = data.jobSkins.get("wizard")!;
    const mending = data.entries.get("spell-mending")!;
    const fly = data.entries.get("spell-fly")!;
    const offered = (learned: string[], level: number) => optionsFor(data, wizard, { discovered: [mending, fly], learned, level, rank: "apprentice" }).base.map((option) => option.id);
    expect(offered([], 5)).not.toContain("spell-mending");
    expect(offered(["spell-mending"], 1)).toContain("spell-mending");
    expect(offered(["spell-mending", "spell-fly"], 4)).not.toContain("spell-fly");
    expect(offered(["spell-mending", "spell-fly"], 5)).toContain("spell-fly");
  });

  it("turns the ids a player sends into options, and refuses any that are not on offer", () => {
    const smith = data.jobSkins.get("blacksmith")!;
    const options = optionsFor(data, smith, { ...nothing, discovered: [data.entries.get("iron")!], rank: "apprentice" });
    expect(chosenFrom(options, { base: "iron", method: "staple:hammer" })).toMatchObject({ base: { name: "Iron" }, method: { name: "Hammer" }, touch: null });
    expect(chosenFrom(options, { base: "iron", method: "staple:hammer", touch: "staple:good-polish" })!.touch).toMatchObject({ name: "A good polish" });
    expect(chosenFrom(options, { base: "gold", method: "staple:hammer" })).toBeNull();
    expect(chosenFrom(options, { base: "iron", method: "staple:fold" })).toBeNull();
    // A method cannot be passed off as a Touch.
    expect(chosenFrom(options, { base: "iron", method: "staple:hammer", touch: "staple:heat" })).toBeNull();
  });
});

describe("a stock order", () => {
  // Every job at every rank, many times over.
  const cases = skins.flatMap((skin) => RANKS.map((rank) => ({ skin, rank })));

  it("asks for two tags from an apprentice and up to three from then on, all different", () => {
    const random = seeded(3);
    for (const { skin, rank } of cases) {
      const most = data.balance.shifts.ranks.find((row) => row.id === rank)!.orderTags;
      const sizes = new Set<number>();
      for (let round = 0; round < 40; round++) {
        const order = stockOrder(data, skin, 3, rank, random);
        expect(order.tags.length, `${skin.job} ${rank}`).toBeGreaterThanOrEqual(2);
        expect(order.tags.length, `${skin.job} ${rank}`).toBeLessThanOrEqual(most);
        expect(new Set(order.tags).size).toBe(order.tags.length);
        for (const tag of order.tags) expect(data.tags.has(tag), tag).toBe(true);
        sizes.add(order.tags.length);
      }
      expect([...sizes].sort(), `${skin.job} ${rank}`).toEqual(most > 2 ? [2, 3] : [2]);
    }
  });

  it("can always be covered in full by some choice of Base, Method, and Touch", () => {
    const random = seeded(11);
    for (const { skin, rank } of cases) {
      const options = optionsFor(data, skin, { ...everything, rank });
      for (let round = 0; round < 40; round++) {
        const order = stockOrder(data, skin, 5, rank, random);
        const [methodTag, baseTag, touchTag] = order.tags;
        const method = options.method.find((option) => option.tags.includes(methodTag!));
        const base = options.base.find((option) => option.tags.includes(baseTag!));
        const touch = touchTag ? options.touch.find((option) => option.tags.includes(touchTag)) : null;
        expect(method && base && touch !== undefined, `${skin.job} ${rank}: ${order.tags.join(", ")}`).toBeTruthy();
        expect(coveredTags(order, { base: base!, method: method!, touch })).toEqual(order.tags);
      }
    }
  });

  it("can be met well by a beginner with nothing but the job's own staples, some of the time", () => {
    const random = seeded(5);
    for (const skin of skins) {
      const options = optionsFor(data, skin, { ...nothing, rank: "apprentice" });
      const all: ShiftOption[][] = options.base.flatMap((base) => options.method.flatMap((method) => [null, ...options.touch].map((touch) => [base, method, ...(touch ? [touch] : [])])));
      let covered = 0;
      for (let round = 0; round < 40; round++) {
        const order = stockOrder(data, skin, 1, "apprentice", random);
        const best = Math.max(...all.map(([base, method, touch]) => coveredTags(order, { base: base!, method: method!, touch }).length));
        // A method is always to hand, so no order is a complete miss.
        expect(best, `${skin.job}: ${order.tags.join(", ")}`).toBeGreaterThanOrEqual(1);
        if (best === order.tags.length) covered++;
      }
      expect(covered, skin.job).toBeGreaterThan(0);
    }
  });

  it("is as demanding as the player's level allows, or one step under", () => {
    expect([1, 2, 3, 4, 5].map((level) => orderTierFor(level, data))).toEqual([0, 1, 2, 2, 3]);
    const random = seeded(9);
    const smith = data.jobSkins.get("blacksmith")!;
    for (const level of [1, 2, 3, 4, 5]) {
      const top = orderTierFor(level, data);
      const tiers = new Set(Array.from({ length: 40 }, () => stockOrder(data, smith, level, "apprentice", random).tier));
      expect([...tiers].sort()).toEqual(top === 0 ? [0] : [top - 1, top]);
    }
  });

  it("reads as a plain sentence that names every tag asked for", () => {
    expect(orderText("A gate hinge that does not squeak", ["metal", "forging"], data.shiftText)).toBe("A gate hinge that does not squeak. It calls for metal and forge work.");
    expect(orderText("A kettle", ["metal", "liquid", "enchanting"], data.shiftText)).toBe("A kettle. It calls for metal, something wet, and an enchantment.");
    const random = seeded(2);
    for (const skin of skins) {
      const order = stockOrder(data, skin, 3, "master", random);
      for (const tag of order.tags) expect(order.text, skin.job).toContain(data.shiftText.tagWords[tag]);
      expect(skin.subjects.some((subject) => order.text.startsWith(`${subject}. `)), order.text).toBe(true);
    }
  });

  it("only draws a tag from a slot if something for that slot can carry it", () => {
    const smith = data.jobSkins.get("blacksmith")!;
    expect(slotTags(data, smith, "method", "apprentice").sort()).toEqual(["energy", "forging", "liquid"]);
    expect(slotTags(data, smith, "method", "journeyman")).toContain("enhance");
    expect(slotTags(data, smith, "base", "apprentice").sort()).toEqual(["metal", "mineral"]);
    // No material or spell in the game is tagged for enchanting yet, so no order asks a smith's Touch for it.
    expect(slotTags(data, smith, "touch", "apprentice")).not.toContain("enchanting");
    expect(slotTags(data, smith, "touch", "apprentice")).toEqual(expect.arrayContaining(["industrial", "protection"]));
  });
});

describe("a result line", () => {
  it("is one of the plain lines for that quality", () => {
    const random = seeded(4);
    for (const quality of QUALITIES) expect(data.shiftText.results[quality]).toContain(resultLine(quality, data.shiftText, random));
  });
});

describe("shift data that does not hold together", () => {
  const files = readGameFiles(process.cwd());
  const withSkins = (change: (skins: typeof files.jobSkins) => typeof files.jobSkins) => () => buildGameData({ ...files, jobSkins: change(structuredClone(files.jobSkins)) });

  it("is refused when a job has no skin, or two", () => {
    expect(withSkins((all) => all.slice(1))).toThrow(new RegExp(`job "${files.jobSkins[0]!.job}" has no skin`));
    expect(withSkins((all) => [...all, all[0]!])).toThrow(/has two skins/);
    // A misspelled job leaves the real one without a skin, which is what gets reported.
    expect(withSkins((all) => ((all[0]!.job = "dragon-dentist"), all))).toThrow(new RegExp(`job "${files.jobSkins[0]!.job}" has no skin`));
  });

  it("leaves out a skin for a job the game does not have", () => {
    const fewer = buildGameData({ ...files, jobs: files.jobs.filter((job) => !job.magic), quests: [] });
    expect([...fewer.jobSkins.keys()].sort()).toEqual([...fewer.jobs.keys()].sort());
  });

  it("is refused for a tag outside the vocabulary, or an id used twice in one skin", () => {
    expect(withSkins((all) => ((all[0]!.method.staples[0]!.tags = ["sparkly"]), all))).toThrow(/uses unknown tag "sparkly"/);
    expect(withSkins((all) => ((all[0]!.touch.staples[0]!.id = all[0]!.base.staples[0]!.id), all))).toThrow(/twice/);
  });

  it("is refused when a beginner would have no method", () => {
    expect(withSkins((all) => (all[0]!.method.staples.forEach((staple) => (staple.rank = "journeyman")), all))).toThrow(/nothing in its method slot for a beginner/);
  });

  it("is refused when a tag has no plain words, or the qualities or ranks are out of order", () => {
    const { metal: _dropped, ...fewerWords } = files.shiftText.tagWords;
    expect(() => buildGameData({ ...files, shiftText: { ...files.shiftText, tagWords: fewerWords } })).toThrow(/no words for tag "metal"/);
    const shifts = files.balance.shifts;
    expect(() => buildGameData({ ...files, balance: { ...files.balance, shifts: { ...shifts, qualities: [...shifts.qualities].reverse() } } })).toThrow(/shift qualities must be/);
    expect(() => buildGameData({ ...files, balance: { ...files.balance, shifts: { ...shifts, ranks: shifts.ranks.map((rank) => ({ ...rank, shifts: rank.shifts + 1 })) } } })).toThrow(/shift ranks must be/);
  });

  it("is fine without any skins at all, for a game built from a few files", () => {
    expect(() => buildGameData({ ...files, jobSkins: undefined })).not.toThrow();
  });
});
