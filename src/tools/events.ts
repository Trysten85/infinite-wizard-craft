// Read, and tidy up, a player's event history.
//   npm run events -- <player>                    the people they know and every event so far
//   npm run events -- <player> delete-person <id>
//   npm run events -- <player> delete-event <id>
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openStore } from "../server/store";

const dbPath = join(process.cwd(), "var/game.db");
const [player, command, id] = process.argv.slice(2);
if (!player || !existsSync(dbPath)) {
  console.log(player ? "No saved game yet." : "Usage: npm run events -- <player> [delete-person <id> | delete-event <id>]");
  process.exit(0);
}
const store = openStore(dbPath);

if (command === "delete-person" && id) {
  store.deletePerson(Number(id));
  console.log(`Deleted person ${id}.`);
} else if (command === "delete-event" && id) {
  store.deleteEvent(Number(id));
  console.log(`Deleted event ${id}.`);
} else {
  const stats = store.getStats(player);
  const people = store.listPeople(player);
  console.log(`${player}: rep ${stats.rep}, ${stats.eventPoints} points toward the next event\n`);
  console.log("People");
  for (const person of people) {
    const flag = person.flag ? `, follow-up "${person.flag}" from day ${person.flagDay}` : "";
    console.log(`  [${person.id}] ${person.name}, ${person.role} (${person.traits.join(", ")})  fondness ${person.fondness}, ${person.status}${flag}`);
    for (const fact of person.facts) console.log(`        fact: ${fact}`);
  }
  console.log("\nEvents");
  for (const event of store.listEvents(player)) {
    const who = people.find((person) => person.id === event.personId)?.name ?? "?";
    console.log(`  [${event.id}] day ${event.day}  ${event.seedId} (${event.kind}, ${event.stakes})  with ${who}  ${event.state}`);
    console.log(`        ${event.sceneSummary}`);
    if (event.chosen) console.log(`        chose ${event.chosen}: ${event.outcomeSummary}  ${JSON.stringify(event.effects)}`);
  }
  console.log("\nRequests");
  for (const request of store.listRequests(player)) {
    const who = people.find((person) => person.id === request.personId)?.name ?? "?";
    console.log(`  [${request.id}] ${who} wants ${request.entryId} for ${request.gold} gold  ${request.state}\n        "${request.ask}"`);
  }
}
store.close();
