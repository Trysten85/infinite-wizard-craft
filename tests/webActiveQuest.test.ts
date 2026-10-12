import { describe, expect, it } from "vitest";
import type { QuestProgress } from "../src/shared/schema";
import { activeQuest, isOpen } from "../web/src/activeQuest";

function quest(id: string, state: QuestProgress["state"], track: QuestProgress["track"] = "main"): QuestProgress {
  return { id, title: id, detail: "x", track, level: 1, gold: 5, xp: 10, state };
}

const quests = [quest("first", "done"), quest("second", "active"), quest("third", "upcoming"), quest("side", "upcoming", "side"), quest("later", "locked")];
const picked = (id: string | null) => activeQuest(quests, id)?.id;

describe("isOpen", () => {
  it("is true only for quests that can be worked on now", () => {
    expect(quests.filter(isOpen).map((item) => item.id)).toEqual(["second", "third", "side"]);
  });
});

describe("activeQuest", () => {
  it("is the server's current quest until the player picks another", () => {
    expect(picked(null)).toBe("second");
  });

  it("is the quest the player picked, main or side", () => {
    expect(picked("third")).toBe("third");
    expect(picked("side")).toBe("side");
  });

  it("goes back to the server's current quest when the pick is finished, locked, or gone", () => {
    expect(picked("first")).toBe("second");
    expect(picked("later")).toBe("second");
    expect(picked("no-such-quest")).toBe("second");
  });

  it("is any open quest when the server marks none as current", () => {
    expect(activeQuest([quest("a", "done"), quest("b", "upcoming")], null)?.id).toBe("b");
  });

  it("is nothing when no quest is open", () => {
    expect(activeQuest([quest("a", "done"), quest("b", "locked")], "b")).toBeNull();
    expect(activeQuest([], null)).toBeNull();
  });
});
