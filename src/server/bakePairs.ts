import { comboKey, type GameEntry } from "../shared/schema";
import type { GameData } from "./gameData";

const BASIC_KINDS = ["element", "material", "focus"];

// The pairs the overnight bake works through: every two hand-written basic things that have no
// recipe yet, a thing with itself included. The shallowest come first, because those are the
// pairs a player meets first.
export function bakePairs(data: GameData): [GameEntry, GameEntry][] {
  const basics = [...data.entries.values()].filter((entry) => BASIC_KINDS.includes(entry.kind) && !data.bakedIds.has(entry.id));
  const pairs: [GameEntry, GameEntry][] = [];
  basics.forEach((first, index) => {
    for (const second of basics.slice(index)) {
      if (!data.combos.has(comboKey(first.id, second.id))) pairs.push([first, second]);
    }
  });
  const deepest = ([a, b]: [GameEntry, GameEntry]) => Math.max(a.depth, b.depth);
  const both = ([a, b]: [GameEntry, GameEntry]) => a.depth + b.depth;
  const key = ([a, b]: [GameEntry, GameEntry]) => comboKey(a.id, b.id);
  return pairs.sort((x, y) => deepest(x) - deepest(y) || both(x) - both(y) || key(x).localeCompare(key(y)));
}
