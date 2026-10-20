import { useState } from "react";
import type { PointerEvent } from "react";
import type { DayView, GameEntry, NeedView, ShiftRules, TownView } from "../../src/shared/schema";
import { qualityName, visitorCue } from "./day";
import { Gold } from "./Gold";
import { Icon, Said } from "./icons";
import { TIME_MARK, timeAmount } from "./timeMark";
import { Shelves } from "./Shelves";
import { PlotArt } from "./Street";
import {
  canStock,
  emptyPlot,
  eveningBlock,
  eveningOffers,
  handBlock,
  staffLine,
  needText,
  planBlock,
  plotCaption,
  plotStates,
  hasTrade,
  plotNeedsJob,
  plotText,
  servesMeals,
  tonightAction,
  upgradeBlock,
} from "./town";

// How many bare lots to draw while the street is being read, or when the server has none to give.
const QUIET_LOTS = 9;

type Props = {
  // Null until the street has been read.
  town: TownView | null;
  // Why there is no street to show, when the server couldn't give one.
  problem: string;
  gold: number;
  level: number;
  // Absent until the player has loaded.
  day?: DayView;
  // True while something is being bought or raised.
  busy: boolean;
  onBuyPlot: () => void;
  onRaise: (plot: number, building: string) => void;
  onUpgrade: (plot: number) => void;
  onHire: (plot: number) => void;
  onLeave: () => void;
  // What is on show for stocking: every discovery by id, what is being carried, the shelf it is
  // over as "plot:slot", and the order board's numbers (null until it has been read).
  entries: Map<string, GameEntry>;
  carrying: GameEntry | null;
  overShelf: string | null;
  rules: ShiftRules | null;
  onGrabShelf: (event: PointerEvent<HTMLElement>, entry: GameEntry, plot: number, slot: number) => void;
  onClearShelf: (plot: number, slot: number) => void;
  onHand: (plot: number) => void;
  // The evening's other actions. `called` is who has been called on this evening, `spells` how
  // many the player has learned, and `overPlot` the plot a carried spell is held over.
  called: ReadonlySet<number>;
  spells: number;
  visitorWaiting: boolean;
  overPlot: number | null;
  onCall: (person: number) => void;
  onMeal: () => void;
  onTonight: () => void;
  // Where the waiting visitor sits, and opening their card.
  visitorPlace: "door" | "tavern";
  onSit: () => void;
};

// The town: one street, drawn side-on, with a plot picked out and described under it. It takes
// the board's place while it is up. Everything on it is the server's; the page only shows it.
export function Town(props: Props) {
  const { town, problem, gold, level, day, busy, onBuyPlot, onRaise, onUpgrade, onLeave } = props;
  const casting = props.carrying?.kind === "spell" ? props.carrying : null;
  const [picked, setPicked] = useState<number | null>(null);
  const lit = day?.phase === "evening";
  const states = town ? plotStates(town, level) : [];
  const free = town ? emptyPlot(town) : null;
  // Until a plot is picked, the one most likely to be wanted: an empty one, or the next for sale.
  const forSale = states.indexOf("for-sale");
  const shown = town?.plots[picked ?? free?.index ?? (forSale >= 0 ? forSale : 0)];
  const shownState = shown ? states[shown.index]! : null;
  // A plan goes on the picked plot if that is empty, and otherwise on the first empty one.
  const site = shown && shownState === "empty" ? shown : free;
  // The first plot waits on a trade discovered. The page is sent the same discoveries the server
  // counts, so it offers the plot exactly when buying it would be allowed.
  const traded = hasTrade(props.entries.values());

  return (
    <section className="town" aria-label="The town">
      <header className="town-head">
        <h2>The Street</h2>
        {town && (
          <p>
            {town.plots.filter((plot) => plot.owned).length} of {town.deeds.have} deeds used
            {town.cheer && ` · ${town.cheer.band}, ${town.cheer.points} cheer`}
          </p>
        )}
        <button onClick={onLeave}>Back to the workbench</button>
      </header>

      <div className="street">
        <ol className="street-plots">
          {town
            ? town.plots.map((plot) => {
                const state = states[plot.index]!;
                return (
                  <li key={plot.index}>
                    <button
                      className={`plot ${state} ${casting && plot.building ? "castable" : ""} ${props.overPlot === plot.index ? "over" : ""} ${props.visitorWaiting && props.visitorPlace === "tavern" && servesMeals(plot.building) ? "visitor" : ""}`}
                      data-plot={plot.building ? plot.index : undefined}
                      aria-pressed={plot.index === shown?.index}
                      onClick={() => setPicked(plot.index)}
                    >
                      <PlotArt state={state} building={plot.building?.id} lit={lit} />
                      <span className="plot-caption">
                        {plotCaption(plot, state) || <span className="sr-only">Plot {plot.index + 1}</span>}
                        {plot.building && (
                          <span className="plot-tier">
                            {" "}
                            <span className="tier-stars" role="img" aria-label={`tier ${plot.building.tier}`}>
                              {Array.from({ length: plot.building.tier }, (_, star) => (
                                <Icon key={star} name="star" />
                              ))}
                            </span>
                            {qualityName(plot.building.quality)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            : Array.from({ length: QUIET_LOTS }, (_, lot) => (
                <li key={lot} className="plot later" aria-hidden="true">
                  <PlotArt state="later" lit={lit} />
                  <span className="plot-caption" />
                </li>
              ))}
        </ol>
      </div>

      {!town ? (
        <p className="town-quiet">
          <Said text={problem || "Reading the street…"} />
        </p>
      ) : (
        <div className="town-boxes">
          {day && (
            <Evening
              day={day}
              offers={eveningOffers(day, town, {
                visitor: props.visitorWaiting,
                spells: props.spells,
                called: props.called.size,
                event: { place: props.visitorPlace },
              })}
              casting={casting}
              busy={busy}
              onTonight={props.onTonight}
            />
          )}
          <section className="hud-box town-box" aria-label="The picked plot">
            {shown?.building ? (
              <Standing {...props} plot={shown.index} building={shown.building} />
            ) : (
              shown &&
              shownState && (
                <>
                  <h3>Plot {shown.index + 1}</h3>
                  <p>{plotText(shown, shownState, town, gold, traded)}</p>
                  {shownState === "for-sale" && (
                    <button disabled={busy || gold < shown.price || plotNeedsJob(shown, shownState, traded)} onClick={onBuyPlot}>
                      {shown.price === 0 ? "Claim this plot" : "Buy this plot"}
                      {shown.price > 0 && <Gold amount={shown.price} />}
                    </button>
                  )}
                </>
              )
            )}
          </section>

          <section className="hud-box town-box" aria-label="Plans in hand">
            <h3>Plans in hand</h3>
            {town.plans.length === 0 && <p className="town-none">None yet. Discover a job, and the one who does it arrives with a plan.</p>}
            <ul className="town-list">
              {town.plans.map((plan) => {
                const block = planBlock(plan, gold, day, site !== null);
                return (
                  <li key={plan.building}>
                    <h4>{plan.name}</h4>
                    <Needs needs={plan.needs} />
                    <button disabled={busy || block !== "" || !site} onClick={() => site && onRaise(site.index, plan.building)}>
                      Raise it{site && ` on plot ${site.index + 1}`}
                      <Gold amount={plan.price} />
                    </button>
                    {block && (
                      <p className="town-why">
                        <Said text={block} />
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="hud-box town-box" aria-label="Townsfolk">
            <h3>Townsfolk</h3>
            {town.townsfolk.length === 0 && <p className="town-none">No one has arrived yet.</p>}
            <ul className="town-list">
              {town.townsfolk.map((person) => (
                <li key={person.person}>
                  <h4>
                    {person.name}
                    {/* Someone named for their trade ("The Farmer") needs no second telling of it. */}
                    {!person.name.toLowerCase().includes(jobName(person.job).toLowerCase()) && (
                      <span className="town-job"> {jobName(person.job)}</span>
                    )}
                  </h4>
                  <p className="town-none">
                    {person.housed ? "Has a place on the street." : "Looking for somewhere to work."}
                    {person.regular && " A regular."}
                  </p>
                  <CallOn called={props.called.has(person.person)} day={day} busy={busy} onCall={() => props.onCall(person.person)} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}

// A job's id, made readable: "master-smith" as "Master smith".
function jobName(id: string): string {
  const words = id.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Needs({ needs }: { needs: NeedView[] }) {
  return (
    <ul className="town-needs">
      {needs.map((need) => (
        <li key={need.label} className={need.met ? "met" : ""}>
          <span className="sr-only">{need.met ? "Have: " : "Missing: "}</span>
          {needText(need)}
        </li>
      ))}
    </ul>
  );
}

type StandingProps = Props & {
  plot: number;
  building: NonNullable<TownView["plots"][number]["building"]>;
};

// A building that stands: what it pays, what it wants, and what the next tier would take.
function Standing(props: StandingProps) {
  const { plot, building, gold, level, day, busy, onUpgrade, entries, carrying, overShelf, rules, onGrabShelf, onClearShelf, onHand } =
    props;
  const next = building.next;
  const block = next ? upgradeBlock(next, gold, level, day) : "";
  const handWhy = handBlock(building, day);
  const staff = staffLine(building, gold);
  // Only a discovery that can be stocked wakes the shelves, and only the picked building's.
  const stockable = carrying && canStock(carrying) ? carrying : null;
  const [overPlot, overSlot] = overShelf ? overShelf.split(":").map(Number) : [null, null];
  return (
    <>
      <h3>
        {building.name} <span className="town-job">tier {building.tier}</span>
      </h3>
      <p>
        Pays <Gold amount={building.takings} label /> a night.
      </p>
      {staff.text && <p className="town-staff">{staff.text}</p>}
      {staff.hire && (
        <button disabled={busy || staff.hire.short > 0} onClick={() => props.onHire(plot)}>
          Hire {staff.hire.name}
          <Gold amount={staff.hire.cost} />
        </button>
      )}
      <Shelves
        plot={plot}
        building={building}
        entries={entries}
        carrying={stockable}
        over={overPlot === plot ? (overSlot ?? null) : null}
        rules={rules}
        busy={busy}
        onGrab={(event, entry, slot) => onGrabShelf(event, entry, plot, slot)}
        onClear={(slot) => onClearShelf(plot, slot)}
      />
      <button disabled={busy || handWhy !== ""} onClick={() => onHand(plot)}>
        Lend a hand
      </button>
      {handWhy && (
        <p className="town-why">
          <Said text={handWhy} />
        </p>
      )}
      {building.enchantment && (
        <p className="town-enchant">
          {building.enchantment.spell.name} is cast on it, for {building.enchantment.daysLeft}{" "}
          {building.enchantment.daysLeft === 1 ? "more day" : "more days"}.
        </p>
      )}
      {servesMeals(building) && props.visitorWaiting && props.visitorPlace === "tavern" && day && (
        <>
          <p className="town-visitor">
            <Said text={visitorCue(day, "tavern").text} />
          </p>
          <button disabled={busy || eveningBlock("visitor", day) !== ""} onClick={props.onSit}>
            Sit with them
          </button>
        </>
      )}
      {servesMeals(building) && (
        <>
          <button disabled={busy || eveningBlock("meal", day) !== ""} onClick={props.onMeal}>
            Have a meal
          </button>
          <p className="town-none">
            <Said text={eveningBlock("meal", day) || "Costs gold by your level. Tomorrow's discoveries pay more."} />
          </p>
        </>
      )}
      {next ? (
        <>
          <h4>Tier {building.tier + 1}</h4>
          <Needs needs={next.needs} />
          <button disabled={busy || block !== ""} onClick={() => onUpgrade(plot)}>
            Raise it a tier
            <Gold amount={next.gold} />
          </button>
          {block && (
                      <p className="town-why">
                        <Said text={block} />
                      </p>
                    )}
        </>
      ) : (
        <p className="town-none">It is as fine as a building gets.</p>
      )}
    </>
  );
}

// The evening at a glance: how much time is left, and each thing tonight offers with what it
// costs. A carried spell says where it can go. Tonight's happening is announced here from noon.
function Evening({
  day,
  offers,
  casting,
  busy,
  onTonight,
}: {
  day: DayView;
  offers: ReturnType<typeof eveningOffers>;
  casting: GameEntry | null;
  busy: boolean;
  onTonight: () => void;
}) {
  const asking = tonightAction(day.tonight);
  const evening = day.phase === "evening";
  return (
    <section className="hud-box town-box evening-box" aria-label="This evening">
      <h3>{evening ? "This evening" : "This evening, from dusk"}</h3>
      {evening && (
        <p className="town-none">
          <Said text={`You have ${day.time} of ${timeAmount(day.timeMax)} left.`} />
        </p>
      )}
      {day.tonight && (
        <p className={`day-tonight ${day.tonight.taken ? "taken" : ""}`}>
          {day.tonight.taken ? `${day.tonight.name}: you have had your share.` : day.tonight.line}
        </p>
      )}
      {casting && <p className="town-why">Drop {casting.name} on a building to cast it there.</p>}
      <ul className="offers">
        {offers.map((offer) => (
          <li key={offer.id} className={offer.ok ? "" : "closed"}>
            <span>{offer.label}</span>
            <span className="offer-cost">
              <Said text={offer.cost} />
            </span>
            {offer.id === "tonight" && asking && (
              <button disabled={busy || !evening} onClick={onTonight}>
                {asking}
              </button>
            )}
          </li>
        ))}
        {offers.length === 0 && <li className="closed">
            <Said text={`Nothing to spend ${TIME_MARK} on yet.`} />
          </li>}
      </ul>
    </section>
  );
}

function CallOn({ called, day, busy, onCall }: { called: boolean; day?: DayView; busy: boolean; onCall: () => void }) {
  const why = called ? "You have called on them tonight." : eveningBlock("call", day);
  return (
    <>
      <button disabled={busy || why !== ""} onClick={onCall}>
        Call on them
      </button>
      {why && (
        <p className="town-why">
          <Said text={why} />
        </p>
      )}
    </>
  );
}
