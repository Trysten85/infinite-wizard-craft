import { describe, expect, it } from "vitest";
import {
  besideTarget,
  clampToBoard,
  newBubbleId,
  parseBoard,
  pickDropTarget,
  spawnPoint,
  type Rect,
} from "../web/src/bubbles";

const rect = (left: number, top: number, width = 100, height = 30): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

const board = { width: 800, height: 600 };
const size = { width: 100, height: 30 };

describe("pickDropTarget", () => {
  it("picks the bubble the dragged one covers most", () => {
    const others = [
      { id: "a", rect: rect(0, 0) },
      { id: "b", rect: rect(120, 0) },
    ];
    expect(pickDropTarget(rect(90, 0), others)).toBe("b");
    expect(pickDropTarget(rect(30, 0), others)).toBe("a");
  });

  it("returns null when nothing overlaps, including bubbles that only touch", () => {
    const others = [{ id: "a", rect: rect(0, 0) }];
    expect(pickDropTarget(rect(300, 300), others)).toBeNull();
    expect(pickDropTarget(rect(100, 0), others)).toBeNull();
    expect(pickDropTarget(rect(0, 30), others)).toBeNull();
    expect(pickDropTarget(rect(0, 0), [])).toBeNull();
  });

  it("gives a tie to the bubble on top", () => {
    const others = [
      { id: "under", rect: rect(0, 0) },
      { id: "over", rect: rect(0, 0) },
    ];
    expect(pickDropTarget(rect(10, 10), others)).toBe("over");
  });
});

describe("clampToBoard", () => {
  it("leaves a bubble that fits where it is", () => {
    expect(clampToBoard(50, 60, size, board)).toEqual({ x: 50, y: 60 });
  });

  it("pulls a bubble back from each edge", () => {
    expect(clampToBoard(-20, 60, size, board)).toEqual({ x: 0, y: 60 });
    expect(clampToBoard(50, -20, size, board)).toEqual({ x: 50, y: 0 });
    expect(clampToBoard(750, 60, size, board)).toEqual({ x: 700, y: 60 });
    expect(clampToBoard(50, 590, size, board)).toEqual({ x: 50, y: 570 });
  });

  it("pins a bubble wider than the board to the left edge", () => {
    expect(clampToBoard(10, 10, { width: 900, height: 30 }, board)).toEqual({ x: 0, y: 10 });
  });
});

describe("besideTarget", () => {
  it("goes to the right of the target when there is room", () => {
    expect(besideTarget({ x: 100, y: 50 }, size, size, board)).toEqual({ x: 212, y: 50 });
  });

  it("goes to the left when the right side would leave the board", () => {
    expect(besideTarget({ x: 650, y: 50 }, size, size, board)).toEqual({ x: 538, y: 50 });
  });
});

describe("spawnPoint", () => {
  it("starts near the centre and stays on the board", () => {
    const first = spawnPoint(board, 0);
    expect(first).toEqual({ x: 360, y: 284 });
    for (let index = 0; index < 100; index++) {
      const { x, y } = spawnPoint(board, index);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(board.width - size.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(board.height - size.height);
    }
  });

  it("does not put consecutive bubbles in the same place", () => {
    expect(spawnPoint(board, 1)).not.toEqual(spawnPoint(board, 0));
    expect(spawnPoint(board, 2)).not.toEqual(spawnPoint(board, 1));
  });
});

describe("parseBoard", () => {
  const known = new Set(["fire", "mud"]);

  it("restores saved bubbles and drops ones for entries the player no longer has", () => {
    const saved = JSON.stringify([
      { id: "1", entryId: "fire", x: 10, y: 20 },
      { id: "2", entryId: "gone", x: 30, y: 40 },
      { id: "3", entryId: "mud", x: 50, y: 60 },
    ]);
    expect(parseBoard(saved, known)).toEqual([
      { id: "1", entryId: "fire", x: 10, y: 20 },
      { id: "3", entryId: "mud", x: 50, y: 60 },
    ]);
  });

  it("returns an empty board for nothing saved, bad JSON, or the wrong shape", () => {
    expect(parseBoard(null, known)).toEqual([]);
    expect(parseBoard("{not json", known)).toEqual([]);
    expect(parseBoard(JSON.stringify({ id: "1" }), known)).toEqual([]);
    expect(parseBoard(JSON.stringify([{ id: "1", entryId: "fire", x: "10", y: 20 }]), known)).toEqual([]);
  });
});

describe("newBubbleId", () => {
  it("never repeats", () => {
    const ids = Array.from({ length: 200 }, newBubbleId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
