import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import type { GameData } from "../src/server/gameData";
import { createFakeClient } from "../src/server/llm/fake";
import { createStory } from "../src/server/story/service";
import { checkBeat, createModelStoryWriter, renderBeat, type BeatBrief, type StoryWriter } from "../src/server/story/writer";
import type { CastMember } from "../src/shared/schema";
import { data, newGame } from "./helpers";

const hester = data.cast.people.find((person) => person.job === "farmer")!;
const brief: BeatBrief = {
  person: { name: hester.name, pronoun: hester.pronoun, personality: hester.personality, voice: hester.voice, traits: hester.traits, facts: hester.facts },
  beat: { title: "The marrow question", premise: "Hester asks which marrow should go to the fair." },
  others: ["Marigold Tumble"],
};

describe("the beat writer", () => {
  it("is given the person as written, and the beat's premise", () => {
    const prompt = renderBeat(brief);
    expect(prompt).toContain(hester.name);
    expect(prompt).toContain(hester.voice);
    for (const fact of hester.facts) expect(prompt).toContain(fact);
    expect(prompt).toContain("Hester asks which marrow");
    expect(prompt).toContain("Marigold Tumble");
  });

  it("refuses numbers, game words, an unfinished sentence, and a scene that runs on", () => {
    expect(checkBeat("Hester holds up two marrows. 'This one,' she says.")).toBeNull();
    expect(checkBeat("She has 3 marrows.")).toMatch(/numbers/);
    expect(checkBeat("Her fondness for you grows.")).toMatch(/Never mention/);
    expect(checkBeat("She holds up a marrow and")).toMatch(/full stop/);
    expect(checkBeat("One. Two. Three. Four. Five. Six. Seven. Eight.")).toMatch(/Too long/);
  });

  it("writes again when a scene breaks a rule", async () => {
    const client = createFakeClient([JSON.stringify({ text: "Your fondness rises by 2." }), JSON.stringify({ text: "Hester weighs a marrow in each hand. 'The fair can have the quiet one,' she says." })]);
    const writer = createModelStoryWriter({ client, log: () => {}, voice: "", story: "STORY GUIDE" });
    expect(await writer.writeBeat(brief)).toMatch(/quiet one/);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0]!.system).toContain("STORY GUIDE");
  });
});

describe("a played beat's scene", () => {
  const beats: CastMember["beats"] = [{ id: "hester-test-first", title: "First", level: 1, gate: 1, waitsOn: [], reward: { kind: "gold", gold: 1, xp: 0 }, premise: "Hester shows you a marrow.", line: "Hester shows you a marrow. It is large." }];
  const world: GameData = { ...data, cast: { people: data.cast.people.map((person) => (person.job === "farmer" ? { ...person, beats } : person)) } };
  function played(): ReturnType<typeof newGame> {
    const game = newGame(1, undefined, { data: world });
    for (const id of ["person", "farmer"]) game.store.addDiscovery("ann", id);
    game.town.arrive("ann");
    const hesterHere = game.store.listPeople("ann").find((person) => person.job === "farmer")!;
    game.store.updatePerson(hesterHere.id, { fondness: 1 });
    game.progress.settle("ann");
    return game;
  }
  const sceneOf = (game: ReturnType<typeof newGame>) => game.town.people("ann").people.find((person) => person.job === "farmer")!.scenes;

  it("shows the plain line until the model has written it, then the model's words, written once", async () => {
    const game = played();
    expect(sceneOf(game)).toEqual([{ beat: "hester-test-first", title: "First", text: beats[0]!.line }]);
    const asked: BeatBrief[] = [];
    const writer: StoryWriter = { writeBeat: async (given) => (asked.push(given), "Hester sets a marrow on the wall between you. 'Prize,' she says.") };
    const story = createStory({ data: world, store: game.store, writer });
    story.prepare("ann");
    await story.idle("ann");
    expect(sceneOf(game)[0]!.text).toMatch(/Prize/);
    expect(asked[0]!.beat.premise).toBe("Hester shows you a marrow.");
    expect(asked[0]!.others).not.toContain(hester.name);
    story.prepare("ann");
    await story.idle("ann");
    expect(asked).toHaveLength(1);
  });

  it("keeps the plain line when the model cannot write it, and does not try again each time", async () => {
    const game = played();
    let tries = 0;
    const story = createStory({ data: world, store: game.store, writer: { writeBeat: async () => (tries++, Promise.reject(new Error("no model"))) } });
    story.prepare("ann");
    await story.idle("ann");
    story.prepare("ann");
    await story.idle("ann");
    expect(tries).toBe(1);
    expect(sceneOf(game)[0]!.text).toBe(beats[0]!.line);
  });

  it("is set writing after any request about the player", async () => {
    const game = played();
    const writer: StoryWriter = { writeBeat: async () => "Hester nods at the marrow. 'Well then,' she says." };
    const story = createStory({ data: world, store: game.store, writer });
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town, story });
    await app.request("/api/players/ann");
    await story.idle("ann");
    expect(game.store.getBeatScenes("ann").get("hester-test-first")).toMatch(/Well then/);
  });
});
