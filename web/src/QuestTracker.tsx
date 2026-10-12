import { useEffect, useRef, useState } from "react";
import type { HintView, QuestProgress, RequestView } from "../../src/shared/schema";
import { activeQuest, isOpen } from "./activeQuest";
import { Gold } from "./Gold";

// How many main quests and how many open side quests the box shows before the rest go behind
// "More quests".
const MAIN_SHOWN = 2;
const SIDE_SHOWN = 3;

const STATE_LABELS: Record<QuestProgress["state"], string> = {
  done: "Completed",
  active: "Active",
  upcoming: "Open",
  locked: "Locked",
};

type Props = {
  // Whose quests these are. The quest they picked to follow is remembered for them in this browser.
  player: string;
  quests: QuestProgress[];
  requests: RequestView[];
  // Recipes people have mentioned for things the player hasn't made, newest last.
  hints: HintView[];
};

// A box on the board. At the top is the active quest: the one the player is following, which is
// the server's current quest until they click another open one. Under it are the next main
// quests, a few side quests, anything people have asked for, and recipes they have let slip, with
// everything else behind a toggle. Minimized, the box is its heading and the active quest alone.
// The lists scroll inside the box. The heading and the toggle stay put above and below them, so
// the toggle is always in reach however long the lists get.
export function QuestTracker({ player, quests, requests, hints }: Props) {
  const pickedKey = `iwc-quest:${player}`;
  const [pickedId, setPickedId] = useState(() => localStorage.getItem(pickedKey));
  const [more, setMore] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const lists = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickedId) localStorage.setItem(pickedKey, pickedId);
  }, [pickedId, pickedKey]);

  function toggle() {
    // Folding the lists away starts them from the top again.
    if (more && lists.current) lists.current.scrollTop = 0;
    setMore(!more);
  }

  const active = activeQuest(quests, pickedId);
  // The active quest has its own place at the top, so the lists below leave it out.
  const others = quests.filter((quest) => quest.id !== active?.id);
  const asked = requests.filter((request) => request.state === "open");
  const done = quests.filter((quest) => quest.state === "done");
  const main = others.filter((quest) => quest.track === "main" && quest.state !== "done");
  const side = others.filter((quest) => quest.track === "side" && isOpen(quest));
  // Side quests that open at a level the player hasn't reached.
  const later = others.filter((quest) => quest.track === "side" && quest.state === "locked");
  const restMain = main.slice(MAIN_SHOWN);
  const restSide = side.slice(SIDE_SHOWN);
  const hidden = restMain.length + restSide.length + later.length + done.length;
  const list = { activeId: active?.id, onPick: setPickedId };

  return (
    <section className={`hud-box quests ${minimized ? "minimized" : ""}`} aria-label="Quests">
      {/* The whole heading folds the box away. The button inside it is what a keyboard reaches. */}
      <header className="hud-head hud-fold" onClick={() => setMinimized(!minimized)}>
        <h2>Quests</h2>
        <span className="hud-count">
          {done.length} / {quests.length}
        </span>
        <button className="hud-fold-button" aria-expanded={!minimized} aria-label={minimized ? "Show all quests" : "Minimize quests"}>
          {minimized ? "▾" : "▴"}
        </button>
      </header>

      {minimized ? (
        // Clicking the one quest left showing opens the log again, to pick another.
        active && <QuestList quests={[active]} activeId={active.id} onPick={() => setMinimized(false)} />
      ) : (
        <div className="quest-lists" ref={lists}>
          {active ? (
            <QuestList title="Active" quests={[active]} {...list} />
          ) : (
            <p className="hud-empty">{quests.length > 0 ? "No open quests. More arrive later." : "Loading…"}</p>
          )}
          {main.length > 0 && <QuestList title="Main" quests={main.slice(0, MAIN_SHOWN)} {...list} />}
          {side.length > 0 && <QuestList title="Side" quests={side.slice(0, SIDE_SHOWN)} {...list} />}

          {asked.length > 0 && (
            <>
              <h3 className="quest-group">Requests</h3>
              <ol className="quest-list">
                {asked.map((request) => (
                  <li key={request.id} className="upcoming">
                    <span className="quest-mark" aria-hidden="true" />
                    <p className="quest-text">
                      <strong>{request.from}</strong>
                      <span className="quest-detail">{request.ask}</span>
                    </p>
                    <Gold amount={request.gold} prefix="+" />
                  </li>
                ))}
              </ol>
            </>
          )}

          {hints.length > 0 && (
            <>
              <h3 className="quest-group">Heard about</h3>
              <ol className="quest-list">
                {[...hints].reverse().map((hint) => (
                  <li key={hint.entry.id} className="upcoming">
                    <span className="quest-mark" aria-hidden="true" />
                    <p className="quest-text">
                      <strong>{hint.entry.name}</strong>
                      <span className="quest-detail">
                        Made from {hint.recipe}, says {hint.from}.
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}

          {more && (
            <div className="quest-more">
              {restMain.length > 0 && <QuestList title="Main, further on" quests={restMain} {...list} />}
              {restSide.length > 0 && <QuestList title="Side" quests={restSide} {...list} />}
              {later.length > 0 && <QuestList title="Opens later" quests={later} {...list} />}
              {done.length > 0 && <QuestList title="Completed" quests={done} {...list} />}
            </div>
          )}
        </div>
      )}

      {!minimized && hidden > 0 && (
        <button className="hud-more" aria-expanded={more} onClick={toggle}>
          {more ? "Show fewer" : `More quests (${hidden})`}
        </button>
      )}
    </section>
  );
}

type ListProps = {
  title?: string;
  quests: QuestProgress[];
  activeId: string | undefined;
  // Called with the quest a player clicked. Only open quests can be clicked.
  onPick: (questId: string) => void;
};

// Each quest is a button: clicking an open one makes it the active quest.
function QuestList({ title, quests, activeId, onPick }: ListProps) {
  return (
    <>
      {title && <h3 className="quest-group">{title}</h3>}
      <ol className="quest-list">
        {quests.map((quest) => {
          const active = quest.id === activeId;
          // The server's current quest is just another open one once the player follows a different quest.
          const state = active ? "active" : quest.state === "active" ? "upcoming" : quest.state;
          return (
            <li key={quest.id} className={`quest ${state}`}>
              <button className="quest-row" disabled={!isOpen(quest)} aria-pressed={active} onClick={() => onPick(quest.id)}>
                <span className="quest-mark" aria-hidden="true" />
                <span className="quest-text">
                  <span className="sr-only">{STATE_LABELS[state]}: </span>
                  <strong>{quest.title}</strong>
                  {quest.state === "locked" ? (
                    <span className="quest-detail">Opens at level {quest.level}.</span>
                  ) : (
                    quest.state !== "done" && <span className="quest-detail">{quest.detail}</span>
                  )}
                  {quest.progress && quest.state !== "done" && (
                    <span className="quest-progress">
                      {quest.progress.have} / {quest.progress.need}
                    </span>
                  )}
                </span>
                <span className="quest-pay">
                  <Gold amount={quest.gold} prefix="+" />
                  {quest.xp > 0 && <span className="quest-xp">+{quest.xp} XP</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
