import type { RefObject } from "react";
import type { GameEntry, PlayerProgress, RankView } from "../../src/shared/schema";

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
};

// The player's standing, in the board's bottom-right corner: job, gold, reputation, and level.
// The job cell is a drop target: letting a job bubble go on it takes that job up. It is also
// the way in to the job's order board, and says when orders are waiting there.
export function StatusBar({ progress, job, rank, jobDrag, jobRef, onOpenOrders }: Props) {
  const { gold, rep, repBand, level, levelInto, levelSpan, shiftReady, shiftIn } = progress;

  return (
    <dl className="hud-box status" aria-label="Status">
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
              {/* A server that isn't serving shifts yet sends neither of these, and the line stays off. */}
              {shiftReady ? (
                <span className="job-cue ready">Orders are waiting</span>
              ) : (
                shiftIn !== undefined && (
                  <span className="job-cue">
                    Orders after {shiftIn} more {shiftIn === 1 ? "discovery" : "discoveries"}
                  </span>
                )
              )}
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
  );
}
