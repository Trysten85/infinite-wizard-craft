import type {
  Building,
  BuildingView,
  DayView,
  GameEntry,
  NeedView,
  QualityId,
  ShiftRules,
  TonightView,
  TownView,
} from "../../src/shared/schema";
import { qualityName } from "./day";
import { QUALITIES } from "../../src/shared/schema";
import { buildingQuality, isStockable, type Stocked } from "../../src/shared/town";

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

// Why something that takes gold and candles can't be done right now, or "" when it can.
// With no day served there are no candles to count, and only the gold is checked.
function costBlock(cost: { gold: number; candles: number }, gold: number, day: DayView | undefined): string {
  if (gold < cost.gold) return `You need ${cost.gold - gold} more gold.`;
  if (!day || cost.candles === 0) return "";
  if (day.phase !== "evening") return `Building is evening work, and takes ${count(cost.candles, "candle", "candles")}. Come back at dusk.`;
  if (day.candles < cost.candles)
    return `This takes ${count(cost.candles, "candle", "candles")}, and you have ${day.candles} left tonight.`;
  return "";
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
  const cost = costBlock({ gold: plan.price, candles: plan.candles }, gold, day);
  // The server knows of something this page does not, such as a level.
  return cost || (plan.ready ? "" : "Not ready yet.");
}

// Why a building can't be raised a tier right now, or "" when it can.
export function upgradeBlock(next: NonNullable<BuildingView["next"]>, gold: number, level: number, day: DayView | undefined): string {
  if (level < next.level) return `Opens at level ${next.level}.`;
  const needs = needsBlock(next.needs);
  if (needs) return needs;
  const cost = costBlock({ gold: next.gold, candles: day?.costs.upgrade ?? 0 }, gold, day);
  return cost || (next.ready ? "" : "Not ready yet.");
}

// What a plot is, in a sentence, for a plot with no building on it.
// The first plot needs a first job, which the server holds to (`no-job`); `hasJob` lets the page
// say so before the player tries.
export function plotNeedsJob(plot: Plot, state: PlotState, hasJob: boolean): boolean {
  return state === "for-sale" && plot.index === 0 && !hasJob;
}

export function plotText(plot: Plot, state: PlotState, town: TownView, gold: number, hasJob = true): string {
  if (state === "empty") return "An empty plot of yours. Raise one of your plans on it.";
  if (state === "locked")
    return `Your deeds cover ${count(town.deeds.have, "plot", "plots")}. Level ${plot.opensAt} brings a deed for this one.`;
  if (state === "later") return "Plots are bought in order along the street. This one comes later.";
  if (plotNeedsJob(plot, state, hasJob))
    return `Your first job earns you a place in town. Take one up, and this plot is ${plot.price} gold.`;
  if (plot.price === 0) return "The next plot along, and it is free.";
  return gold < plot.price
    ? `The next plot along, for ${plot.price} gold. You need ${plot.price - gold} more.`
    : `The next plot along, for ${plot.price} gold.`;
}

// What putting a discovery on a shelf would do to a building, said in the order board's manner.
// The page does not know the lifts or the rank bonus a building has tonight (they are the
// server's), so both stocks are read at no lift. That is enough to say which way it would go.
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
  // A quality is only read from a building's wants, so that is all the stand-in needs.
  const reads = { wants: building.wants } as Building;
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

// Why a hand can't be lent at this building right now, or "" when it can. The once-a-night limit
// is the server's to say, and it does so in its own sentence.
export function handBlock(building: BuildingView, day: DayView | undefined): string {
  if (building.stock.every((shelf) => shelf.entry === null)) return "Its shelves are bare, so a hand would change nothing.";
  if (!day) return "";
  const candles = count(day.costs.hand, "candle", "candles");
  if (day.phase !== "evening") return `Lending a hand is evening work, and takes ${candles}. Come back at dusk.`;
  if (day.candles < day.costs.hand) return `This takes ${candles}, and you have ${day.candles} left tonight.`;
  return "";
}

// The building that serves meals. A meal needs one standing, and the server says no otherwise.
export const TAVERN = "tavern";

// The two happenings that are taken by asking, and what asking is called. The rest work through
// what the player would do anyway, and the server says so if they are asked for here.
const ASKED_FOR: Record<string, string> = { pedlar: "Look through the pedlar's pack", stargazer: "Ask the stargazer" };

export function tonightAction(tonight: TonightView | null): string | null {
  return tonight && !tonight.taken ? (ASKED_FOR[tonight.id] ?? null) : null;
}

// Why an evening action costing this many candles can't be done now, or "" when it can.
export function eveningBlock(candles: number, day: DayView | undefined): string {
  if (!day || candles === 0) return "";
  const cost = count(candles, "candle", "candles");
  if (day.phase !== "evening") return `This is evening work, and takes ${cost}. Come back at dusk.`;
  if (day.candles < candles) return `This takes ${cost}, and you have ${day.candles} left tonight.`;
  return "";
}

// One line of what the evening offers: what it is, what it costs, and whether it can be done now.
export type Offer = { id: string; label: string; cost: string; ok: boolean };

// Everything tonight offers and what each costs, so the player can choose where the candles go.
export function eveningOffers(day: DayView, town: TownView, have: { visitor: boolean; spells: number; called: number }): Offer[] {
  const standing = town.plots.flatMap((plot) => (plot.building ? [plot.building] : []));
  const free = town.plots.some((plot) => plot.owned && !plot.building);
  const row = (id: string, label: string, candles: number): Offer => ({
    id,
    label,
    cost: candles === 0 ? "free" : count(candles, "candle", "candles"),
    ok: eveningBlock(candles, day) === "",
  });
  const offers: Offer[] = [];
  if (have.visitor) offers.push(row("visitor", "Sit with tonight's visitor", day.costs.visitor));
  if (town.townsfolk.length > have.called) offers.push(row("call", "Call on someone in town", day.costs.call));
  if (standing.some((building) => building.id === TAVERN)) offers.push(row("meal", "A meal at the Tavern, for gold", day.costs.meal));
  if (standing.some((building) => building.stock.some((shelf) => shelf.entry)))
    offers.push(row("hand", "Lend a hand at a building", day.costs.hand));
  if (standing.length > 0 && have.spells > 0) offers.push(row("enchant", "Cast a spell on a building", day.costs.enchant));
  if (free && town.plans.some((plan) => plan.ready)) offers.push(row("build", "Raise a building", day.costs.build));
  if (tonightAction(day.tonight)) offers.push(row("tonight", day.tonight!.name, 0));
  return offers;
}
