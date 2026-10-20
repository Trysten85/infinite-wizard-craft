import type {
  BuildingView,
  DayView,
  EveningAction,
  GameEntry,
  NeedView,
  QualityId,
  ShiftRules,
  TonightView,
  TownView,
} from "../../src/shared/schema";
import { qualityName } from "./day";
import { QUALITIES } from "../../src/shared/schema";
import { buildingQuality, isStockable, type Stocked, type Wanting } from "../../src/shared/town";
import { timeAmount as hourglasses } from "./timeMark";

// The street, as the page words it. What a plot costs, what a building needs, and whether any of
// it is allowed are the server's. This only reads what the server sent and says it plainly.

export type Plot = TownView["plots"][number];
export type Plan = TownView["plans"][number];

// How a plot is drawn and what can be done with it. A plot past the player's deeds is `locked`.
// Plots are bought in order, so of the rest only the first is `for-sale`, and the others come `later`.
export type PlotState = "building" | "empty" | "for-sale" | "locked" | "later";

export function plotStates(town: TownView, level: number): PlotState[] {
  const next = town.plots.find((plot) => !plot.owned)?.index;
  return town.plots.map((plot) => {
    if (plot.building) return "building";
    if (plot.owned) return "empty";
    if (plot.opensAt > level) return "locked";
    return plot.index === next ? "for-sale" : "later";
  });
}

// The few words under a plot on the street.
export function plotCaption(plot: Plot, state: PlotState): string {
  if (plot.building) return plot.building.name;
  if (state === "empty") return "Your plot";
  if (state === "locked") return `Level ${plot.opensAt}`;
  if (state === "for-sale") return plot.price === 0 ? "Free" : `${plot.price} gold`;
  return "";
}

// The first plot the player owns with nothing on it, or null.
export function emptyPlot(town: TownView): Plot | null {
  return town.plots.find((plot) => plot.owned && !plot.building) ?? null;
}

const count = (amount: number, one: string, many: string) => `${amount} ${amount === 1 ? one : many}`;

function listed(words: string[]): string {
  if (words.length < 3) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}

export function needText(need: NeedView): string {
  return need.progress ? `${need.label} (${need.progress.have} of ${need.progress.need})` : need.label;
}

// How each action is named when the page says it waits for dusk.
const DOING: Record<EveningAction, string> = {
  visitor: "Sitting with a visitor",
  meal: "A meal at the Tavern",
  call: "Calling on someone",
  hand: "Lending a hand",
  enchant: "Casting on a building",
  upgrade: "Building",
  build: "Building",
};

// Why an action can't be taken now for the hour or the time it takes, or "" when it can. This
// words the server's `refuseAction`: an "anytime" action has no hour and takes nothing from the
// evening, and an "evening" one waits for dusk and needs enough time left. `cost` is the action's
// own unless something (a plan) says otherwise. With no day served there is nothing to check.
export function eveningBlock(action: EveningAction, day: DayView | undefined, cost = day?.costs[action] ?? 0): string {
  if (!day || day.access[action] === "anytime") return "";
  const takes = cost > 0 ? `, and takes ${hourglasses(cost)}` : "";
  if (day.phase !== "evening") return `${DOING[action]} is evening work${takes}. Come back at dusk.`;
  if (day.time < cost) return `This takes ${hourglasses(cost)}, and you have ${hourglasses(day.time)} left tonight.`;
  return "";
}

// Why something that takes gold and may take time can't be done right now, or "" when it can.
function costBlock(action: EveningAction, cost: { gold: number; time: number }, gold: number, day: DayView | undefined): string {
  if (gold < cost.gold) return `You need ${cost.gold - gold} more gold.`;
  return eveningBlock(action, day, cost.time);
}

function needsBlock(needs: NeedView[]): string {
  const missing = needs.filter((need) => !need.met);
  return missing.length > 0 ? `Still needs ${listed(missing.map(needText))}.` : "";
}

// Why a plan can't be raised right now, or "" when it can. `hasPlot` is whether there is an
// empty plot of the player's to raise it on.
export function planBlock(plan: Plan, gold: number, day: DayView | undefined, hasPlot: boolean): string {
  const needs = needsBlock(plan.needs);
  if (needs) return needs;
  if (!hasPlot) return "You need an empty plot to raise it on.";
  const cost = costBlock("build", { gold: plan.price, time: plan.time }, gold, day);
  // The server knows of something this page does not, such as a level.
  return cost || (plan.ready ? "" : "Not ready yet.");
}

// Why a building can't be raised a tier right now, or "" when it can.
export function upgradeBlock(next: NonNullable<BuildingView["next"]>, gold: number, level: number, day: DayView | undefined): string {
  if (level < next.level) return `Opens at level ${next.level}.`;
  const needs = needsBlock(next.needs);
  if (needs) return needs;
  const cost = costBlock("upgrade", { gold: next.gold, time: day?.costs.upgrade ?? 0 }, gold, day);
  return cost || (next.ready ? "" : "Not ready yet.");
}

// Whether the player has discovered a trade, which is what the first plot asks for (`no-job`).
// The server counts the jobs among the same discoveries the page is sent, not whoever has come
// to town (nobody comes until a building stands) and not the job the player has taken up.
export function hasTrade(entries: Iterable<GameEntry>): boolean {
  for (const entry of entries) if (entry.kind === "job") return true;
  return false;
}

// What a plot is, in a sentence, for a plot with no building on it.
export function plotNeedsJob(plot: Plot, state: PlotState, hasTrade: boolean): boolean {
  return state === "for-sale" && plot.index === 0 && !hasTrade;
}

export function plotText(plot: Plot, state: PlotState, town: TownView, gold: number, hasTrade: boolean): string {
  if (state === "empty") return "An empty plot of yours. Raise one of your plans on it.";
  if (state === "locked")
    return `Your deeds cover ${count(town.deeds.have, "plot", "plots")}. Level ${plot.opensAt} brings a deed for this one.`;
  if (state === "later") return "Plots are bought in order along the street. This one comes later.";
  if (plotNeedsJob(plot, state, hasTrade))
    return `Your first job earns you a place in town. Discover one, and this plot is ${plot.price} gold.`;
  if (plot.price === 0) return "The next plot along, and it is free.";
  return gold < plot.price
    ? `The next plot along, for ${plot.price} gold. You need ${plot.price - gold} more.`
    : `The next plot along, for ${plot.price} gold.`;
}

// What putting a discovery on a shelf would do to a building, said in the order board's manner.
// Both stocks are read with the lifts and bonuses the server sent on the building, so the
// preview gives the exact quality the shelf would.
// `from` and `to` are the building's quality before and after, with the lifts and bonuses it has tonight.
export type StockChange = { direction: "better" | "worse" | "same"; covers: string[]; from: QualityId; to: QualityId };

export function stockChange(
  building: BuildingView,
  entries: Map<string, GameEntry>,
  carried: GameEntry,
  slot: number,
  shifts: ShiftRules,
): StockChange {
  const held = (id: string | undefined) => (id ? entries.get(id) : undefined);
  const now = building.stock.map((shelf) => held(shelf.entry?.id)).filter((entry): entry is GameEntry => !!entry);
  // The same discovery on another of this building's shelves is moved, not copied.
  const after = building.stock
    .map((shelf, index) => (index === slot ? carried : shelf.entry?.id === carried.id ? undefined : held(shelf.entry?.id)))
    .filter((entry): entry is GameEntry => !!entry);
  // A quality is read from the wants and nothing else, which is all `Wanting` asks for, so there
  // is no whole `Building` to stand in for here.
  const reads: Wanting = { wants: building.wants };
  // `lifts` is what is already applied tonight, so it goes in whole and no second hand is added.
  const extra = {
    rankBonus: building.rankBonus,
    enchantBonus: building.enchantBonus,
    lifts: { perks: building.lifts, hand: 0, shift: 0 },
  };
  const rate = (stock: Stocked[]): QualityId => buildingQuality(reads, building.tier, stock, extra, shifts);
  const from = rate(now);
  const to = rate(after);
  const before = QUALITIES.indexOf(from);
  const next = QUALITIES.indexOf(to);
  const others = new Set(after.filter((entry) => entry.id !== carried.id).flatMap((entry) => entry.tags));
  return {
    direction: next > before ? "better" : next < before ? "worse" : "same",
    covers: building.wants.filter((want) => carried.tags.includes(want) && !others.has(want)),
    from,
    to,
  };
}

// What a hovering discovery says about itself, over the shelf it is held above.
export function stockChangeText(change: StockChange): string {
  const covers = change.covers.length > 0 ? ` Covers ${listed(change.covers)}.` : "";
  if (change.from !== change.to) {
    return `${change.direction === "better" ? "Better" : "Worse"}: ${qualityName(change.from)} to ${qualityName(change.to)}.${covers}`;
  }
  return change.covers.length > 0 ? `Covers ${listed(change.covers)}.` : "No difference to its stock.";
}

// Whether a discovery can be stocked at all: materials and spells, never elements or jobs.
export function canStock(entry: GameEntry): boolean {
  return isStockable(entry);
}

// Who runs a building, and whether the player can hire them now. Nobody comes until the morning
// after it stands; once they have, hiring costs gold once, and until then it earns nothing.
// The price is the server's (`staff.hireCost`).
export function staffLine(building: BuildingView, gold: number): { text: string; hire: { name: string; cost: number; short: number } | null } {
  const staff = building.staff;
  if (!staff) return { text: "", hire: null };
  if (staff.hired && staff.person) return { text: `${staff.person.name} runs it.`, hire: null };
  if (!staff.person)
    return { text: "Nobody works here yet. Someone comes the morning after a building stands, and until then it earns nothing.", hire: null };
  const short = Math.max(0, staff.hireCost - gold);
  const need = short > 0 ? ` You need ${short} more gold.` : "";
  return {
    text: `${staff.person.name} has come to work here. Until you hire them it earns nothing.${need}`,
    hire: { name: staff.person.name, cost: staff.hireCost, short },
  };
}

// Why a hand can't be lent at this building right now, or "" when it can. The once-a-night limit
// is the server's to say, and it does so in its own sentence.
export function handBlock(building: BuildingView, day: DayView | undefined): string {
  if (building.stock.every((shelf) => shelf.entry === null)) return "Its shelves are bare, so a hand would change nothing.";
  return eveningBlock("hand", day);
}

// What asking to take part in tonight's happening is called, when it is taken by asking. The
// words are the happening's own (`ask` in data/tonight.json), so the page knows no happening by
// its id: one that works through whatever the player would do anyway sends no action.
export function tonightAction(tonight: TonightView | null): string | null {
  return tonight && !tonight.taken ? (tonight.action ?? null) : null;
}

// Whether a building serves meals. The server works it out from the building's perks and says so
// on the view, so a second place that serves them is offered without the page changing.
export function servesMeals(building: { meals?: boolean } | null | undefined): boolean {
  return building?.meals === true;
}

// Where tonight's visitor sits. The server says so on the event itself; before it is in hand,
// they are at the Tavern once somewhere serves meals, which is how the server seats them, and at
// the door otherwise.
export function visitorPlace(event: { place?: "door" | "tavern" } | null, town: TownView | null): "door" | "tavern" {
  if (event?.place) return event.place;
  const serves = town?.plots.some((plot) => servesMeals(plot.building)) ?? false;
  return serves ? "tavern" : "door";
}

// One line of what the evening offers: what it is, what it costs, and whether it can be done now.
export type Offer = { id: string; label: string; cost: string; ok: boolean };

// Everything tonight offers and what each costs, so the player can choose where the time goes.
// `have.event` is the visitor in hand, if one is, so the line agrees with their card about where
// they are sitting.
export function eveningOffers(
  day: DayView,
  town: TownView,
  have: { visitor: boolean; spells: number; called: number; event?: { place?: "door" | "tavern" } | null },
): Offer[] {
  const standing = town.plots.flatMap((plot) => (plot.building ? [plot.building] : []));
  const free = town.plots.some((plot) => plot.owned && !plot.building);
  // A row for one of the day's actions, priced and gated as the server would. `tonight` is not one.
  const row = (id: EveningAction | "tonight", label: string): Offer => {
    const time = id === "tonight" ? 0 : day.costs[id];
    return { id, label, cost: time === 0 ? "free" : hourglasses(time), ok: id === "tonight" || eveningBlock(id, day) === "" };
  };
  const offers: Offer[] = [];
  if (have.visitor)
    offers.push(row("visitor", `Sit with tonight's visitor${visitorPlace(have.event ?? null, town) === "tavern" ? " at the Tavern" : ""}`));
  if (town.townsfolk.length > have.called) offers.push(row("call", "Call on someone in town"));
  if (standing.some(servesMeals)) offers.push(row("meal", "A meal at the Tavern, for gold"));
  if (standing.some((building) => building.stock.some((shelf) => shelf.entry)))
    offers.push(row("hand", "Lend a hand at a building"));
  if (standing.length > 0 && have.spells > 0) offers.push(row("enchant", "Cast a spell on a building"));
  if (free && town.plans.some((plan) => plan.ready)) offers.push(row("build", "Raise a building"));
  if (tonightAction(day.tonight)) offers.push(row("tonight", day.tonight!.name));
  return offers;
}
