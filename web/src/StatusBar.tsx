import { useEffect, useState, type RefObject } from "react";
import type { GameEntry, PlayerProgress, RankView } from "../../src/shared/schema";
import { Icon, Said, spoken } from "./icons";
import { timeAmount } from "./timeMark";
import { bedOffer, noonShare, oilText, orderCue, phaseName, sunReadout, sunShare, sunText, sunTicks, type Day } from "./day";

type Props = {
  progress: PlayerProgress;
  // The job the player has taken up.
  job: GameEntry | null;
  // Their rank in it, once the order board has been read.
  rank: RankView | null;
  // Whether a job is being dragged, and whether it is over the job cell right now.
  jobDrag: "none" | "dragging" | "over";
  // The job cell, so a drag can tell when it is over it.
  jobRef: RefObject<HTMLDivElement | null>;
  onOpenOrders: () => void;
  // True while the server is being asked to end the day.
  dayBusy: boolean;
  onEndDay: () => void;
  // Brings last night's ledger back up.
  onShowLedger: () => void;
};

// The player's standing, in the board's bottom-right corner: the day along the top, and under it
// job, gold, reputation, and level. The job cell is a drop target: letting a job bubble go on it
// takes that job up. It is also the way in to the job's order board, and says when orders are
// waiting there.
export function StatusBar({ progress, job, rank, jobDrag, jobRef, onOpenOrders, dayBusy, onEndDay, onShowLedger }: Props) {
  const { gold, rep, repBand, level, levelInto, levelSpan, shiftReady, day } = progress;
  // The cue under the job reads from the day. There is none until the player has loaded.
  const cue = day ? orderCue(day, !!shiftReady) : null;

  return (
    <div className="hud-box status">
      {day && <DayStrip day={day} ordersWaiting={!!job && !!shiftReady} busy={dayBusy} onEndDay={onEndDay} onShowLedger={onShowLedger} />}
      <dl className="stats" aria-label="Status">
        <div className={`stat job ${jobDrag} ${job && shiftReady ? "orders-ready" : ""}`} ref={jobRef}>
          <dt>Job</dt>
          <dd className="stat-value">
            {jobDrag !== "none" ? (
              <span className="job-invite">Drop to take this job</span>
            ) : job ? (
              <button className="job-open" onClick={onOpenOrders} title="Open the order board">
                <span key={job.id} className="job-name bump">
                  {job.name}
                  {rank && <span className="rep-band">{rank.name}</span>}
                </span>
                {cue && <span className={`job-cue ${cue.ready ? "ready" : ""}`}>{cue.text}</span>}
              </button>
            ) : (
              <button className="job-open" onClick={onOpenOrders} title="Open the order board">
                <span className="job-empty">Drop a job here</span>
              </button>
            )}
          </dd>
        </div>

        <div className="stat">
          <dt>Gold</dt>
          {/* Remounted whenever the amount changes, which replays the bump. */}
          <dd key={gold} className="stat-value bump">
            <span className="coin" aria-hidden="true" />
            {gold}
          </dd>
        </div>

        <div className="stat">
          <dt>Reputation</dt>
          <dd key={rep} className="stat-value bump">
            <svg className="stat-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.5 13.5 3.5v4c0 3.3-2.3 5.6-5.5 7-3.2-1.4-5.5-3.7-5.5-7v-4z" />
            </svg>
            {rep}
            {repBand && <span className="rep-band">{repBand}</span>}
          </dd>
        </div>

        <div className="stat level">
          <dt>Level</dt>
          <dd className="stat-value">
            <span key={level} className="level-badge bump">
              {level}
            </span>
            <span className="xp">
              <span
                className="xp-bar"
                role="progressbar"
                aria-label="Experience"
                aria-valuemin={0}
                aria-valuemax={levelSpan}
                aria-valuenow={levelInto}
              >
                <span style={{ width: `${(levelInto / levelSpan) * 100}%` }} />
              </span>
              <span className="xp-count">
                {levelInto} / {levelSpan} XP
              </span>
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

type DayProps = { day: Day; ordersWaiting: boolean; busy: boolean; onEndDay: () => void; onShowLedger: () => void };

// The day, as a strip along the top of the status box: which day it is, a meter the sun crosses
// from dawn to dusk with noon marked on it, and from dusk the time left to spend, as hourglasses. The way to
// end the day is here too, and it says what would be given up before anything happens.
function DayStrip({ day, ordersWaiting, busy, onEndDay, onShowLedger }: DayProps) {
  const [asking, setAsking] = useState(false);
  const offer = bedOffer(day, ordersWaiting);
  const oil = oilText(day);

  // A question asked at one time of day isn't the question at another.
  useEffect(() => setAsking(false), [day.number, day.phase]);

  return (
    <section className={`day ${day.phase}`} aria-label="The day">
      <p className="day-name">
        <strong>Day {day.number}</strong> {phaseName(day)}
      </p>

      <div className="sun-clock">
        <div className="sun-meter" role="img" aria-label={sunText(day)} title="Each new discovery moves the sun on a notch.">
          <span className="sun-ticks">
            {sunTicks(day).map((tick, index) => (
              <span key={index} className={`sun-tick ${tick} ${index < day.noon ? "before-noon" : ""}`} />
            ))}
          </span>
          <span className="sun-noon" style={{ left: `${noonShare(day) * 100}%` }} />
          <span className="sun" style={{ left: `${sunShare(day) * 100}%` }} />
          <span className="sun-dusk" title="Dusk: the shop and the order board close here." />
        </div>
        <span className="sun-labels" aria-hidden="true">
          <span className="sun-label dawn">Dawn</span>
          <span className="sun-label noon" style={{ left: `${noonShare(day) * 100}%` }}>
            Noon
          </span>
          <span className="sun-label dusk">Dusk</span>
        </span>
        <span className="sun-readout">{sunReadout(day)}</span>
      </div>

      {day.phase === "evening" && (
        <span className="hourglasses" role="img" aria-label={spoken(`You have ${day.time} of ${timeAmount(day.timeMax)} left`)}>
          {Array.from({ length: day.timeMax }, (_, index) => (
            <Icon key={index} name="hourglass" className={index < day.time ? "full" : "spent"} />
          ))}
        </span>
      )}
      {day.phase !== "evening" && <span className="dusk-note">The shop and the order board close at dusk.</span>}

      <p className="day-links">
        {day.tonight && (
          <span className={`day-tonight ${day.tonight.taken ? "taken" : ""}`} title={day.tonight.line}>
            Tonight: {day.tonight.name}
          </span>
        )}
        {offer && (
          <button className="link" aria-expanded={asking} onClick={() => setAsking(!asking)}>
            {offer.label.toLowerCase()}
          </button>
        )}
        {day.lastLedger && (
          <button className="link" onClick={onShowLedger}>
            last night
          </button>
        )}
      </p>

      {oil && <p className="day-oil">{oil}, unless you spend some time first.</p>}

      {asking && offer && (
        <div className="day-ask" role="group" aria-label={offer.label}>
          <p>
            <Said text={offer.warning} />
          </p>
          <button disabled={busy} onClick={onEndDay}>
            {busy ? "…" : offer.label}
          </button>
          <button className="link" onClick={() => setAsking(false)}>
            not yet
          </button>
        </div>
      )}
    </section>
  );
}
