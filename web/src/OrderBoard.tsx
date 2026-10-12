import { useEffect, useRef, useState } from "react";
import type { ShiftBoard, ShiftOption, ShiftOrder, ShiftResult, ShiftSlot } from "../../src/shared/schema";
import { coveredTags, meetsTier, previewRange } from "../../src/shared/shifts";
import { ordersClosedText, type Day } from "./day";
import { Gold } from "./Gold";
import { previewText } from "./shiftPreview";

const SLOTS: ShiftSlot[] = ["base", "method", "touch"];

// What the player has chosen to fill an order with. The touch is optional.
export type ShiftChoice = { order: number; base: string; method: string; touch?: string };

type Props = {
  // Null while the board is being fetched.
  board: ShiftBoard | null;
  // Why there is no board to show, when the server couldn't give one.
  problem: string;
  // Where the player is in their day. Absent on a server from before the day.
  day?: Day;
  // How the last order went, once one has been filled.
  result: ShiftResult | null;
  // True while a filled order is on its way to the server.
  busy: boolean;
  onWork: (choice: ShiftChoice) => void;
  // Puts a result away to take another order.
  onNext: () => void;
  onClose: () => void;
};

// The order board for the player's job. A shift is one order filled by picking a base, a method,
// and an optional touch. It reads as a puzzle: the order asks for some tags, and each thing that
// could go in a slot shows which of them it brings.
export function OrderBoard({ board, problem, day, result, busy, onWork, onNext, onClose }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Takes focus once, when the board comes up, so Escape and Tab start from it.
  useEffect(() => {
    card.current?.focus();
    const onKeyDown = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="event-backdrop">
      <div className="event-card order-board" role="dialog" aria-modal="true" aria-labelledby="order-board-title" tabIndex={-1} ref={card}>
        <header className="event-head">
          <h2 id="order-board-title">Order board</h2>
          {board?.job && board.rank && (
            <p>
              {board.job.name} · {board.rank.name}
              <span className="rank-progress">
                {board.rank.shifts} {board.rank.shifts === 1 ? "shift" : "shifts"} worked
                {board.rank.next && ` · ${board.rank.next.name} at ${board.rank.next.shifts}`}
              </span>
            </p>
          )}
        </header>

        {result ? (
          <Result result={result} more={!!board?.ready && board.orders.length > 0} onNext={onNext} onClose={onClose} />
        ) : !board ? (
          <Closed onClose={onClose}>{problem || "Fetching the orders…"}</Closed>
        ) : !board.job ? (
          <Closed onClose={onClose}>You have no job yet. Drop a job on the Job cell to take one up, and its orders will come here.</Closed>
        ) : !board.ready || board.orders.length === 0 ? (
          <Closed onClose={onClose}>
            {day
              ? ordersClosedText(day)
              : board.shiftIn === undefined
                ? "No orders are waiting."
                : `No orders are waiting. The next shift opens after ${board.shiftIn} more ${board.shiftIn === 1 ? "discovery" : "discoveries"}.`}
          </Closed>
        ) : (
          <Bench board={board} busy={busy} onWork={onWork} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function Closed({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <p className="order-closed">{children}</p>
      <button className="event-done" onClick={onClose}>
        Close
      </button>
    </>
  );
}

// The working part of the board: the orders, the three slots, and what the choice would make.
function Bench({
  board,
  busy,
  onWork,
  onClose,
}: {
  board: ShiftBoard;
  busy: boolean;
  onWork: (choice: ShiftChoice) => void;
  onClose: () => void;
}) {
  const [orderId, setOrderId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Partial<Record<ShiftSlot, string>>>({});
  const order = board.orders.find((item) => item.id === orderId) ?? null;
  const chosen = (slot: ShiftSlot) => board.options[slot].find((option) => option.id === picked[slot]) ?? null;
  const base = chosen("base");
  const method = chosen("method");
  const touch = chosen("touch");
  const pick = base && method ? { base, method, touch } : null;

  // A slot holds one thing. Clicking it again takes it back out.
  function toggle(slot: ShiftSlot, option: ShiftOption) {
    setPicked((current) => ({ ...current, [slot]: current[slot] === option.id ? undefined : option.id }));
  }

  return (
    <>
      <h3 className="order-step">1. Pick an order</h3>
      <ul className="order-list">
        {board.orders.map((item) => (
          <li key={item.id}>
            <button className="order-ticket" aria-pressed={item.id === orderId} onClick={() => setOrderId(item.id)}>
              <span className="order-text">{item.text}</span>
              <span className="order-asks">
                <Tags tags={item.tags} wanted={item.tags} />
                <span className="order-tier">tier {item.tier}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {order && (
        <>
          <h3 className="order-step">2. Fill it</h3>
          <div className="order-slots">
            {SLOTS.map((slot) => (
              <Slot
                key={slot}
                name={board.slots[slot]}
                optional={slot === "touch"}
                options={board.options[slot]}
                pickedId={picked[slot]}
                order={order}
                onPick={(option) => toggle(slot, option)}
              />
            ))}
          </div>
        </>
      )}

      {/* The preview and the buttons stay in view at the bottom while the options above scroll. */}
      <div className="order-foot">
        {order && (
          <div className="order-preview" aria-live="polite">
            <Checklist order={order} pick={pick} slots={board.slots} />
            <p className="order-likely">
              {pick && board.rank
                ? previewText(previewRange(order, pick, board.rank.id, board.rules), board.rules)
                : `Choose a ${board.slots.base} and a ${board.slots.method}.`}
            </p>
          </div>
        )}
        <p className="event-foot">
          <button className="link" disabled={busy} onClick={onClose}>
            not now
          </button>
          <button
            className="event-done"
            disabled={busy || !order || !base || !method}
            onClick={() =>
              order &&
              base &&
              method &&
              onWork({ order: order.id, base: base.id, method: method.id, ...(touch ? { touch: touch.id } : {}) })
            }
          >
            {busy ? "Working…" : "Fill the order"}
          </button>
        </p>
      </div>
    </>
  );
}

// A row of tags. The ones in `wanted` are what the order asks for, and stand out.
function Tags({ tags, wanted }: { tags: string[]; wanted: string[] }) {
  if (tags.length === 0) return <span className="tag none">no tags</span>;
  return tags.map((tag) => (
    <span key={tag} className={`tag ${wanted.includes(tag) ? "wanted" : ""}`}>
      {tag}
    </span>
  ));
}

type SlotProps = {
  name: string;
  optional: boolean;
  options: ShiftOption[];
  pickedId: string | undefined;
  order: ShiftOrder;
  onPick: (option: ShiftOption) => void;
};

// One slot: the job's staples, which are always to hand, and then the player's own things.
function Slot({ name, optional, options, pickedId, order, onPick }: SlotProps) {
  const groups = [
    { title: "Always to hand", options: options.filter((option) => option.own) },
    { title: "Your own", options: options.filter((option) => !option.own) },
  ].filter((group) => group.options.length > 0);

  return (
    <section className="order-slot" aria-label={name}>
      <h4>
        {name}
        {optional && <span className="slot-optional"> optional</span>}
      </h4>
      {groups.length === 0 && <p className="slot-empty">Nothing to use here yet.</p>}
      {groups.map((group) => (
        <div key={group.title} className="slot-group">
          <h5>{group.title}</h5>
          <ul>
            {group.options.map((option) => (
              <li key={option.id}>
                <button className="slot-option" aria-pressed={option.id === pickedId} onClick={() => onPick(option)}>
                  <span className="option-name">
                    {option.name}
                    {option.tier > 0 && <span className="option-tier">tier {option.tier}</span>}
                  </span>
                  <span className="option-tags">
                    <Tags tags={option.tags} wanted={order.tags} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

type Pick = { base: ShiftOption; method: ShiftOption; touch: ShiftOption | null };

// What the order asks for, ticked off as the chosen things cover it.
function Checklist({ order, pick, slots }: { order: ShiftOrder; pick: Pick | null; slots: Record<ShiftSlot, string> }) {
  const covered = pick ? coveredTags(order, pick) : [];
  const tierMet = pick ? meetsTier(order, pick) : false;
  return (
    <ul className="order-checks">
      {order.tags.map((tag) => (
        <li key={tag} className={covered.includes(tag) ? "met" : ""}>
          {tag}
        </li>
      ))}
      <li className={tierMet ? "met" : ""} title={`Met when the ${slots.base} or the ${slots.touch} is at least tier ${order.tier}.`}>
        tier {order.tier} or finer
      </li>
    </ul>
  );
}

function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : amount < 0 ? `−${-amount}` : "0";
}

type ResultProps = { result: ShiftResult; more: boolean; onNext: () => void; onClose: () => void };

// How the order went, what it paid, and a new rank if this shift earned one.
function Result({ result, more, onNext, onClose }: ResultProps) {
  return (
    <>
      <p className="order-done-for">{result.order.text}</p>
      <p className={`order-quality ${result.quality.id}`}>{result.quality.name}</p>
      <p className="order-line">{result.line}</p>
      <dl className="event-effects">
        <div className={result.gold > 0 ? "up" : ""}>
          <dt>Gold</dt>
          <dd>
            <Gold amount={result.gold} prefix="+" />
          </dd>
        </div>
        <div className={result.xp > 0 ? "up" : ""}>
          <dt>XP</dt>
          <dd>{signed(result.xp)}</dd>
        </div>
        <div className={result.rep > 0 ? "up" : result.rep < 0 ? "down" : ""}>
          <dt>Reputation</dt>
          <dd>{signed(result.rep)}</dd>
        </div>
      </dl>
      {result.rankUp && (
        <p className="order-rank-up">
          <strong>A new rank.</strong> You are now {/^[aeiou]/i.test(result.rankUp.name) ? "an" : "a"} {result.rankUp.name}.
        </p>
      )}
      <p className="event-foot">
        {more && (
          <button className="link" onClick={onNext}>
            take another order
          </button>
        )}
        <button className="event-done" onClick={onClose}>
          Done
        </button>
      </p>
    </>
  );
}
