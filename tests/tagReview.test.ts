import { beforeEach, describe, expect, it } from "vitest";
import { loadGameData } from "../src/server/gameData";
import { openStore, type Store } from "../src/server/store";
import { listTagReviews, retagEntry } from "../src/server/tagReview";
import type { GameEntry } from "../src/shared/schema";

const data = loadGameData(process.cwd());

function generated(id: string, tags: string[]): GameEntry {
  return { id, name: id, kind: "material", description: "x", tags, affinity: [], tier: 0, source: "generated", depth: 1, xp: 10 };
}

let store: Store;
beforeEach(() => {
  store = openStore(":memory:");
});

const reviewIds = () => listTagReviews(data, store).map((review) => review.entry.id);

describe("listTagReviews", () => {
  it("lists hand-written entries that have no tags", () => {
    const untagged = [...data.entries.values()].filter((e) => e.tags.length === 0 && e.kind !== "spell").map((e) => e.id);
    expect(untagged).toContain("shadow");
    expect(listTagReviews(data).map((review) => review.entry.id)).toEqual(untagged);
  });

  it("lists generated entries with no tags, a model hint, or retired tags, and skips the rest", () => {
    store.saveGenerated("a+a", "a", "a", generated("mist", []));
    store.saveGenerated("b+b", "b", "b", generated("gloom", ["mind"]), "darkness");
    store.saveGenerated("c+c", "c", "c", generated("clay", ["mineral", "soil"]));
    store.saveGenerated("d+d", "d", "d", generated("ore", ["metal"]));
    const reviews = listTagReviews(data, store).filter((review) => review.entry.source === "generated");
    expect(reviews.map((review) => review.entry.id)).toEqual(["mist", "gloom", "clay"]);
    expect(reviews[1]!.suggestion).toBe("darkness");
    expect(reviews[2]!.retired).toEqual(["soil"]);
  });
});

describe("retagEntry", () => {
  beforeEach(() => {
    store.saveGenerated("b+b", "b", "b", generated("gloom", []), "darkness");
  });

  it("sets the tags and takes the entry off the review list", () => {
    retagEntry(data, store, "gloom", ["mind", "rare"]);
    expect(store.getEntry("gloom")!.tags).toEqual(["mind", "rare"]);
    expect(store.getTagSuggestion("gloom")).toBeUndefined();
    expect(reviewIds()).not.toContain("gloom");
  });

  it("refuses tags outside the vocabulary, including the model's own hint", () => {
    expect(() => retagEntry(data, store, "gloom", ["darkness"])).toThrow(/Not in the tag vocabulary: darkness/);
    expect(store.getEntry("gloom")!.tags).toEqual([]);
  });

  it("refuses more than five tags", () => {
    expect(() => retagEntry(data, store, "gloom", ["mind", "area", "toxic", "liquid", "metal", "plant"])).toThrow(/at most 5/);
  });

  it("refuses hand-written and unknown entries", () => {
    expect(() => retagEntry(data, store, "shadow", ["mind"])).toThrow(/hand-written/);
    expect(() => retagEntry(data, store, "nothing", ["mind"])).toThrow(/No generated entry/);
  });
});
