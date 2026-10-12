import type { GameEntry } from "../../src/shared/schema";

// A short line saying what sort of thing an entry is, for places where its bubble isn't enough.
export function kindLabel(entry: GameEntry): string {
  if (entry.kind !== "spell") return entry.kind.charAt(0).toUpperCase() + entry.kind.slice(1);
  const rank = entry.tier === 0 ? "Cantrip" : `Tier ${entry.tier} spell`;
  return entry.school ? `${rank} · ${entry.school.charAt(0).toUpperCase()}${entry.school.slice(1)}` : rank;
}
