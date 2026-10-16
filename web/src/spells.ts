import type { GameEntry } from "../../src/shared/schema";

// The level a spell takes to learn, and so to cast. The server puts it on every spell entry.
export function spellLevel(spell: GameEntry): number {
  return spell.learnLevel ?? Math.max(1, spell.tier);
}

// What the spellbook says while a spell is held over it: the level it takes, or the price,
// before it is paid.
export function learnNote(spell: GameEntry, learned: string[], gold: number, level: number): string {
  if (learned.includes(spell.id)) return "Already learned";
  if (spellLevel(spell) > level) return `Needs level ${spellLevel(spell)}`;
  // What this player pays, which the town may have cut below the spell's base cost.
  const price = spell.learnPrice ?? spell.learnCost;
  if (price === undefined) return "Learn this spell";
  return price > gold ? `Costs ${price} gold` : `Learn for ${price} gold`;
}

// Cantrips need level 1, where everyone starts. Higher tiers wait for higher levels.
export function canCast(spell: GameEntry, level: number): boolean {
  return spellLevel(spell) <= level;
}
