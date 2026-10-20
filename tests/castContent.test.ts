import { describe, expect, it } from "vitest";
import { data } from "./helpers";

// The hand-written cast in data/cast.json, held to the voice guide and to the town it lives in.
// The schema and the loader check its shape; these check what it says.

const people = data.cast.people;

// Every piece of the cast's text a player reads or the model is handed.
function wordsOf(person: (typeof people)[number]): string[] {
  return [
    person.personality,
    person.voice,
    ...person.traits,
    ...person.facts,
    ...person.callingLines,
    ...person.lesson.flatMap((quest) => [quest.title, quest.detail]),
    ...person.beats.flatMap((beat) => [beat.title, beat.premise, beat.line]),
  ];
}

describe("the cast", () => {
  it("has a person for every building's trade", () => {
    const trades = new Set(people.map((person) => person.job));
    for (const building of data.buildings.values()) if (building.job) expect(trades, building.id).toContain(building.job);
  });

  it("never writes a number or an exclamation mark, as the voice guide asks", () => {
    for (const person of people) {
      for (const words of wordsOf(person)) {
        expect(words, person.id).not.toMatch(/[0-9]/);
        expect(words, person.id).not.toContain("!");
      }
    }
  });

  it("gives everyone traits, facts, and more than one thing to say when called on", () => {
    for (const person of people) {
      expect(person.traits.length, person.id).toBeGreaterThanOrEqual(1);
      expect(person.facts.length, person.id).toBeGreaterThanOrEqual(1);
      expect(person.callingLines.length, person.id).toBeGreaterThan(1);
      for (const line of person.callingLines) expect(line, person.id).toContain("{name}");
    }
  });

  it("gives every person three to five beats, as the guide asks", () => {
    for (const person of people) {
      expect(person.beats.length, person.id).toBeGreaterThanOrEqual(3);
      expect(person.beats.length, person.id).toBeLessThanOrEqual(5);
    }
  });

  it("runs the town thread through the six buildings' people, and ends it with a finale that waits on every piece", () => {
    const thread = people.flatMap((person) => person.beats.filter((beat) => beat.thread).map((beat) => ({ person, beat })));
    // The finale is the one thread beat that waits on other people's beats and has nothing to do
    // itself: it is done once its pieces are. (A first beat with no objective is not a finale.)
    const finales = thread.filter(({ person, beat }) => !beat.done && beat.waitsOn.some((id) => !person.beats.some((own) => own.id === id)));
    expect(finales).toHaveLength(1);
    const pieces = thread.filter(({ beat }) => finales[0]!.beat.waitsOn.includes(beat.id));
    expect(pieces).toHaveLength(finales[0]!.beat.waitsOn.length);
    const homes = new Set(pieces.map(({ person }) => person.home));
    for (const building of data.buildings.keys()) expect(homes, building).toContain(building);
  });
});
