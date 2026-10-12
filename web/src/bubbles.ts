import { z } from "zod";

// One copy of an entry on the board. x and y are its top-left corner in board pixels.
// The order of a Bubble[] is the stacking order: later bubbles sit on top.
export type Bubble = { id: string; entryId: string; x: number; y: number };

export type Rect = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

const GAP = 12;

const boardSchema = z.array(z.object({ id: z.string(), entryId: z.string(), x: z.number(), y: z.number() }));

let created = 0;

// Not crypto.randomUUID: the page may be opened over plain http from another machine.
export function newBubbleId(): string {
  return `${Date.now().toString(36)}-${(created++).toString(36)}`;
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

// The bubble the dragged one would merge with: the one it covers most.
// `others` is in stacking order, so a tie goes to the one on top.
export function pickDropTarget(dragged: Rect, others: { id: string; rect: Rect }[]): string | null {
  let best: string | null = null;
  let bestArea = 0;
  for (const other of others) {
    const area = overlapArea(dragged, other.rect);
    if (area > 0 && area >= bestArea) {
      best = other.id;
      bestArea = area;
    }
  }
  return best;
}

export function clampToBoard(x: number, y: number, size: Size, board: Size): Point {
  return {
    x: Math.max(0, Math.min(x, board.width - size.width)),
    y: Math.max(0, Math.min(y, board.height - size.height)),
  };
}

// Where a bubble goes when a merge fails: just right of the target, or left if there's no room.
export function besideTarget(target: Point, targetSize: Size, size: Size, board: Size): Point {
  const right = target.x + targetSize.width + GAP;
  const x = right + size.width <= board.width ? right : target.x - size.width - GAP;
  return clampToBoard(x, target.y, size, board);
}

// Where the nth click-spawned bubble lands: spiralling out from the centre so they don't stack.
export function spawnPoint(board: Size, index: number): Point {
  const step = index % 30;
  const angle = step * 2.4;
  const radius = Math.min(18 * Math.sqrt(step), Math.min(board.width, board.height) / 3);
  return {
    x: Math.round(board.width / 2 - 40 + radius * Math.cos(angle)),
    y: Math.round(board.height / 2 - 16 + radius * Math.sin(angle)),
  };
}

// Reads a saved board, dropping bubbles for entries the player no longer has.
export function parseBoard(raw: string | null, known: ReadonlySet<string>): Bubble[] {
  try {
    const saved = boardSchema.safeParse(JSON.parse(raw ?? "[]"));
    return saved.success ? saved.data.filter((bubble) => known.has(bubble.entryId)) : [];
  } catch {
    return [];
  }
}
