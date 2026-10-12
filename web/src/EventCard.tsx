import { Fragment, useEffect, useRef } from "react";
import type { EventOutcome, EventView, ResponseType } from "../../src/shared/schema";

const RESPONSE_LABELS: Record<ResponseType, string> = {
  generous: "Generous",
  skilled: "Skilled",
  fair: "Fair",
  sharp: "Sharp",
  avoid: "Avoid",
};

type Effects = EventOutcome["effects"];

// How an event ended: what the player did last, and everything the server said came of it.
export type EventEnding = EventOutcome & { chosen: string };

type Props = {
  event: EventView;
  // What the player's reaction earlier in this conversation changed, if the page saw it happen.
  earlierEffects: Effects | null;
  // Set once the conversation is over. The card then shows how it went.
  ending: EventEnding | null;
  // True while an answer is on its way to the server. The next part may have to be written first.
  busy: boolean;
  onRespond: (type: ResponseType) => void;
  // Puts the card away. An unfinished conversation stays waiting.
  onClose: () => void;
};

// Someone has turned up at the stall. The card is the conversation so far, told as turns: theirs
// on the left and the player's on the right, then what the player can do next or how it ended.
export function EventCard({ event, earlierEffects, ending, busy, onRespond, onClose }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Takes focus once, when the card comes up, so Escape and Tab start from it.
  useEffect(() => {
    card.current?.focus();
    const onKeyDown = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // When the conversation moves on, bring the newest exchange into view.
  useEffect(() => {
    card.current?.querySelector("[data-newest]")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [event.beat, ending]);

  const { person } = event;
  const lastEarlier = event.earlier.length - 1;

  return (
    <div className="event-backdrop">
      <div className="event-card" role="dialog" aria-modal="true" aria-labelledby="event-who" tabIndex={-1} ref={card}>
        <header className="event-head">
          <h2 id="event-who">{person.name}</h2>
          <p>
            {person.role}
            {person.returning && " · back again"}
          </p>
          <p className="event-kind">
            {event.kind} · {event.mood.join(", ")} · part {event.beat} of {event.beats}
          </p>
        </header>

        <div className="event-talk">
          {event.earlier.map((turn, index) => (
            <Fragment key={index}>
              <p className="turn them">{turn.scene}</p>
              <p className="turn you" data-newest={!ending && index === lastEarlier ? "" : undefined}>
                <span className="turn-who">You</span>
                {turn.chosen}
              </p>
              <p className="turn them">
                {turn.outcome}
                {earlierEffects && index === lastEarlier && <EffectsLine effects={earlierEffects} />}
              </p>
            </Fragment>
          ))}
          <p className="turn them">{event.scene}</p>
          {ending && (
            <>
              <p className="turn you" data-newest="">
                <span className="turn-who">You</span>
                {ending.chosen}
              </p>
              <p className="turn them">{ending.outcome}</p>
            </>
          )}
        </div>

        {ending ? (
          <Ending ending={ending} who={person.name} onClose={onClose} />
        ) : (
          <>
            <ul className="event-responses">
              {event.responses.map((response) => (
                <li key={response.type}>
                  <button className={`event-response ${response.type}`} disabled={busy} onClick={() => onRespond(response.type)}>
                    <span className="response-type">
                      {RESPONSE_LABELS[response.type]}
                      {response.spell && ` · uses ${response.spell.name}`}
                    </span>
                    {response.text}
                  </button>
                </li>
              ))}
            </ul>
            <p className="event-foot">
              {busy && <span>{person.name} is thinking…</span>}
              <button className="link" disabled={busy} onClick={onClose}>
                not now
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : amount < 0 ? `−${-amount}` : "0";
}

const EFFECT_NAMES = { gold: "gold", rep: "reputation", fondness: "fondness" } as const;

// A quiet note of what a reaction changed, for the turns in the middle of a conversation.
function EffectsLine({ effects }: { effects: Effects }) {
  const changed = (["gold", "rep", "fondness"] as const).filter((effect) => effects[effect] !== 0);
  if (changed.length === 0) return null;
  return <span className="turn-effects">{changed.map((effect) => `${EFFECT_NAMES[effect]} ${signed(effects[effect])}`).join(" · ")}</span>;
}

function Ending({ ending, who, onClose }: { ending: EventEnding; who: string; onClose: () => void }) {
  const { effects, request, hint, gift } = ending;
  return (
    <>
      <dl className="event-effects">
        {(["gold", "rep", "fondness"] as const).map((effect) => (
          <div key={effect} className={effects[effect] > 0 ? "up" : effects[effect] < 0 ? "down" : ""}>
            <dt>{EFFECT_NAMES[effect]}</dt>
            <dd>{signed(effects[effect])}</dd>
          </div>
        ))}
      </dl>
      {/* The person's own parting words are already the end of the conversation above. These
          notes say plainly what the player has come away with. */}
      {request && (
        <p className="event-parting">
          <strong>Request:</strong> bring {request.from} {request.entry.name}. It pays {request.gold} gold the moment you have it.
        </p>
      )}
      {hint && (
        <p className="event-parting">
          <strong>Recipe noted:</strong> {hint.entry.name} is made from {hint.recipe}.
        </p>
      )}
      {gift && (
        <p className="event-parting">
          <strong>Gift from {who}:</strong> {gift.name}. It is on your board.
        </p>
      )}
      <button className="event-done" onClick={onClose}>
        Done
      </button>
    </>
  );
}
