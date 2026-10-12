import { useState } from "react";
import type { DayView, NeedView, TownView } from "../../src/shared/schema";
import { Gold } from "./Gold";
import { PlotArt } from "./Street";
import { emptyPlot, needText, planBlock, plotCaption, plotStates, plotText, upgradeBlock, type PlotState } from "./town";

// How many bare lots to draw while the street is being read, or when the server has none to give.
const QUIET_LOTS = 9;

type Props = {
  // Null until the street has been read.
  town: TownView | null;
  // Why there is no street to show, when the server couldn't give one.
  problem: string;
  gold: number;
  level: number;
  // Absent on a server from before the day.
  day?: DayView;
  // True while something is being bought or raised.
  busy: boolean;
  onBuyPlot: () => void;
  onRaise: (plot: number, building: string) => void;
  onUpgrade: (plot: number) => void;
  onLeave: () => void;
};

// The town: one street, drawn side-on, with a plot picked out and described under it. It takes
// the board's place while it is up. Everything on it is the server's; the page only shows it.
export function Town({ town, problem, gold, level, day, busy, onBuyPlot, onRaise, onUpgrade, onLeave }: Props) {
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

  return (
    <section className="town" aria-label="The town">
      <header className="town-head">
        <h2>The Street</h2>
        {town && (
          <p>
            {town.plots.filter((plot) => plot.owned).length} of {town.deeds.have} deeds used
            {town.cheer && ` · ${town.cheer.band}`}
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
                    <button className={`plot ${state}`} aria-pressed={plot.index === shown?.index} onClick={() => setPicked(plot.index)}>
                      <PlotArt state={state} building={plot.building?.id} lit={lit} />
                      <span className="plot-caption">
                        {plotCaption(plot, state) || <span className="sr-only">Plot {plot.index + 1}</span>}
                        {plot.building && <span className="plot-tier"> {"★".repeat(plot.building.tier)}</span>}
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
        <p className="town-quiet">{problem || "Reading the street…"}</p>
      ) : (
        <div className="town-boxes">
          <section className="hud-box town-box" aria-label="The picked plot">
            {shown?.building ? (
              <Standing
                plot={shown.index}
                building={shown.building}
                gold={gold}
                level={level}
                day={day}
                busy={busy}
                onUpgrade={onUpgrade}
              />
            ) : (
              shown &&
              shownState && (
                <>
                  <h3>Plot {shown.index + 1}</h3>
                  <p>{plotText(shown, shownState, town, gold)}</p>
                  {shownState === "for-sale" && (
                    <button disabled={busy || gold < shown.price} onClick={onBuyPlot}>
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
                    {block && <p className="town-why">{block}</p>}
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
                    {person.name} <span className="town-job">{jobName(person.job)}</span>
                  </h4>
                  <p className="town-none">{person.housed ? "Has a place on the street." : "Looking for somewhere to work."}</p>
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

type StandingProps = {
  plot: number;
  building: NonNullable<TownView["plots"][number]["building"]>;
  gold: number;
  level: number;
  day?: DayView;
  busy: boolean;
  onUpgrade: (plot: number) => void;
};

// A building that stands: what it pays, what it wants, and what the next tier would take.
function Standing({ plot, building, gold, level, day, busy, onUpgrade }: StandingProps) {
  const next = building.next;
  const block = next ? upgradeBlock(next, gold, level, day) : "";
  return (
    <>
      <h3>
        {building.name} <span className="town-job">tier {building.tier}</span>
      </h3>
      <p>
        Pays <Gold amount={building.takings} label /> a night.
      </p>
      <p className="town-none">Wants {building.wants.join(", ")}.</p>
      {next ? (
        <>
          <h4>Tier {building.tier + 1}</h4>
          <Needs needs={next.needs} />
          <button disabled={busy || block !== ""} onClick={() => onUpgrade(plot)}>
            Raise it a tier
            <Gold amount={next.gold} />
          </button>
          {block && <p className="town-why">{block}</p>}
        </>
      ) : (
        <p className="town-none">It is as fine as a building gets.</p>
      )}
    </>
  );
}
