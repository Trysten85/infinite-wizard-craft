// Show how long each level should take, and how fast saved players have really gone.
//   npm run pace
// Each level's XP comes partly from quests and the rest from discoveries. A day is as many new
// discoveries as the sun has notches, fewer once a shift takes its piece of each day. The hours
// are only as good as the assumptions below, so compare them with the saved players at the bottom.
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

const widths = [7, 12, 16, 8, 18, 18, 8, 8, 12];
console.log(row(["Level", "XP to next", "From quests", "Share", "From discoveries", "About", "Hours", "Days", "Reached on"], widths));
let totalHours = 0;
let totalFound = 0;
let totalDays = 0;
// Shifts: one a day, from the level the first job quest opens at. A day with its shift worked
// has that much less room for discoveries.
const { shifts, day } = data.balance;
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
  const days = found / (level >= jobFrom ? day.length - day.shiftNotches : day.length);
  totalHours += hours;
  totalFound += found;
  totalDays += days;
  if (level >= jobFrom) {
    shiftCount += days;
    // A Good result on an order of the tier that level is given.
    shiftXp += days * payFor({ tags: [], tier: orderTierFor(level, data) }, "good", shifts).xp;
  }
  const share = `${Math.round((fromQuests / span) * 100)}%`;
  console.log(row([level, span, `${fromQuests} (${quests.length} quests)`, share, span - fromQuests, `${found} discoveries`, hours.toFixed(1), days.toFixed(1), `day ${Math.ceil(totalDays) + 1}`], widths));
}
const atCap = data.quests.filter((quest) => quest.level === cap).length;
console.log(`\nLevel ${cap} takes ${(xpStep * (cap - 1) * cap) / 2} XP: about ${totalFound} discoveries, ${totalHours.toFixed(1)} hours, and ${Math.round(totalDays)} days. ${atCap} more quests open there.`);
console.log(`A day is ${day.length} new discoveries, or ${day.length - day.shiftNotches} with the shift worked, so about ${Math.round((totalHours * 60) / totalDays)} minutes at these speeds. With no shifts at all the climb is ${Math.ceil(totalFound / day.length)} days.`);
const climb = (xpStep * (cap - 1) * cap) / 2;
console.log(`One shift a day once a job is taken up (level ${jobFrom}): about ${Math.round(shiftCount)} before level ${cap}, worth about ${Math.round(shiftXp)} XP at Good (${Math.round((shiftXp / climb) * 100)}% of the climb, on top of the table above).`);
console.log(`Discoveries pay ${data.balance.discoveryXpByTier.join(", ")} XP by tier. To make every level longer or shorter, change levels.xpStep in config/balance.json, and scale the quests' XP with it to keep their share.`);

const dbPath = join(process.cwd(), "var/game.db");
if (existsSync(dbPath)) {
  // Opened read-only, so looking never changes a saved game.
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const made = new Map(db.prepare("SELECT id, json FROM entries").all().map((saved) => [saved.id as string, JSON.parse(saved.json as string) as GameEntry]));
  const starting = new Set(data.balance.startingEntries);
  const players = db.prepare("SELECT DISTINCT player FROM discoveries ORDER BY player").all().map((saved) => saved.player as string);
  // A save from before days has no day to read until the server has opened it once.
  const hasDays = db.prepare("PRAGMA table_info(player_stats)").all().some((column) => column.name === "day");
  const dayOf = (player: string) => (hasDays ? ((db.prepare("SELECT day FROM player_stats WHERE player = ?").get(player)?.day as number | undefined) ?? 1) : null);
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
    const on = dayOf(player);
    const days = on === null ? "" : `, on day ${on}`;
    // What their speed makes of a day, to hold against the table above.
    const dayLength = perHour > 0 ? `, a day of ${day.length} in about ${Math.round((day.length / perHour) * 60)} minutes` : "";
    console.log(`  ${player.padEnd(12)} ${String(found.length).padStart(4)} discoveries in ${Math.round(active / 60)} active minutes (${perHour} an hour), ${xpEach} XP each on average${days}${dayLength}`);
  }
  db.close();
}
