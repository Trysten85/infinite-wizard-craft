// Show how long each level should take, and how fast saved players have really gone.
//   npm run pace
// Each level's XP comes partly from quests and the rest from discoveries. The hours are only as
// good as the assumptions below, so compare them with the saved players at the bottom.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadGameData, xpForTier } from "../server/gameData";
import { orderTierFor } from "../server/shifts/orders";
import { payFor } from "../shared/shifts";
import type { GameEntry } from "../shared/schema";

// What a player is assumed to manage at each level: how many new things an hour, and what one
// is worth on average. Early discoveries are quick and shallow. Later ones are slower and deeper,
// and more of the hour goes on visitors and the shop. The last row stands for any level past it.
const ASSUMED = [
  { perHour: 80, xpEach: 12 },
  { perHour: 56, xpEach: 17 },
  { perHour: 46, xpEach: 21 },
  { perHour: 40, xpEach: 24 },
];
// A gap longer than this between two discoveries is time away from the game.
const AWAY_SECONDS = 300;

const data = loadGameData(process.cwd());
const { xpStep, cap } = data.balance.levels;
const row = (cells: (string | number)[], widths: number[]) => cells.map((cell, index) => String(cell).padEnd(widths[index]!)).join("");

const widths = [7, 12, 16, 8, 18, 18, 8];
console.log(row(["Level", "XP to next", "From quests", "Share", "From discoveries", "About", "Hours"], widths));
let totalHours = 0;
let totalFound = 0;
// Shifts: one opens every so many discoveries, from the level the first job quest opens at.
const { shifts } = data.balance;
const jobFrom = data.quests.find((quest) => quest.id === "first-job")?.level ?? 1;
let shiftCount = 0;
let shiftXp = 0;
for (let level = 1; level < cap; level++) {
  const span = level * xpStep;
  const quests = data.quests.filter((quest) => quest.level === level);
  const fromQuests = quests.reduce((total, quest) => total + quest.xp, 0);
  const assumed = ASSUMED[Math.min(level, ASSUMED.length) - 1]!;
  const found = Math.ceil((span - fromQuests) / assumed.xpEach);
  const hours = found / assumed.perHour;
  totalHours += hours;
  totalFound += found;
  if (level >= jobFrom) {
    const worked = Math.floor(found / shifts.every);
    shiftCount += worked;
    // A Good result on an order of the tier that level is given.
    shiftXp += worked * payFor({ tags: [], tier: orderTierFor(level, data) }, "good", shifts).xp;
  }
  const share = `${Math.round((fromQuests / span) * 100)}%`;
  console.log(row([level, span, `${fromQuests} (${quests.length} quests)`, share, span - fromQuests, `${found} discoveries`, hours.toFixed(1)], widths));
}
const atCap = data.quests.filter((quest) => quest.level === cap).length;
console.log(`\nLevel ${cap} takes ${(xpStep * (cap - 1) * cap) / 2} XP: about ${totalFound} discoveries and ${totalHours.toFixed(1)} hours. ${atCap} more quests open there.`);
const climb = (xpStep * (cap - 1) * cap) / 2;
console.log(`Shifts open every ${shifts.every} discoveries once a job is taken up: about ${shiftCount} before level ${cap}, worth about ${shiftXp} XP at Good (${Math.round((shiftXp / climb) * 100)}% of the climb, on top of the table above).`);
console.log(`Discoveries pay ${data.balance.discoveryXpByTier.join(", ")} XP by tier. To make every level longer or shorter, change levels.xpStep in config/balance.json, and scale the quests' XP with it to keep their share.`);

const dbPath = join(process.cwd(), "var/game.db");
if (existsSync(dbPath)) {
  // Opened read-only, so looking never changes a saved game.
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const made = new Map(db.prepare("SELECT id, json FROM entries").all().map((saved) => [saved.id as string, JSON.parse(saved.json as string) as GameEntry]));
  const starting = new Set(data.balance.startingEntries);
  const players = db.prepare("SELECT DISTINCT player FROM discoveries ORDER BY player").all().map((saved) => saved.player as string);
  console.log(`\nSaved players (${players.length})`);
  for (const player of players) {
    const found = db.prepare("SELECT entry_id, discovered_at FROM discoveries WHERE player = ? ORDER BY discovered_at, rowid").all(player);
    const times = found.map((saved) => Date.parse(`${String(saved.discovered_at).replace(" ", "T")}Z`) / 1000);
    let active = 0;
    for (let index = 1; index < times.length; index++) {
      const gap = times[index]! - times[index - 1]!;
      if (gap < AWAY_SECONDS) active += gap;
    }
    const entries = found.map((saved) => data.entries.get(saved.entry_id as string) ?? made.get(saved.entry_id as string)).filter((entry) => entry !== undefined && !starting.has(entry.id));
    const xp = entries.reduce((total, entry) => total + xpForTier(entry!.tier, data.balance), 0);
    const perHour = active > 0 ? Math.round(found.length / (active / 3600)) : 0;
    const xpEach = entries.length > 0 ? Math.round(xp / entries.length) : 0;
    console.log(`  ${player.padEnd(12)} ${String(found.length).padStart(4)} discoveries in ${Math.round(active / 60)} active minutes (${perHour} an hour), ${xpEach} XP each on average`);
  }
  db.close();
}
