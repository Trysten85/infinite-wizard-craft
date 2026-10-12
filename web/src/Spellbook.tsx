import { useEffect, useRef, useState, type RefObject } from "react";
import type { GameEntry } from "../../src/shared/schema";
import { PALETTE, Sprite } from "./pixels";
import { canCast, spellLevel } from "./spells";

// The book, closed, seen from the front: cover, corner pieces, a gem, a clasp, and its page edges.
const BOOK = [
  "..kkkkkkkkkkkkkkkkkkkk..",
  ".kPppppppppppppppppppPk.",
  ".kPyyppppppppppppppyyPk.",
  ".kPyppppppppppppppppyPk.",
  ".kPpppppppqqqqpppppppPk.",
  ".kPppppppqquuqqppppppPk.",
  ".kPpppppqquwuuqqpppyyYk.",
  ".kPpppppqquuuuqqpppyyYk.",
  ".kPppppppqquuqqppppppPk.",
  ".kPpppppppqqqqpppppppPk.",
  ".kPyppppppppppppppppyPk.",
  ".kPyyppppppppppppppyyPk.",
  ".kPppppppppppppppppppPk.",
  ".kkkkkkkkkkkkkkkkkkkkkk.",
  "..kccccccccccccccccccCk.",
  "..kkkkkkkkkkkkkkkkkkkkk.",
];

// Motes that drift round the book while a spell is being carried to it.
const MOTES: [x: number, y: number, color: string][] = [
  [-2, 2, "q"],
  [25, 0, "w"],
  [26, 9, "u"],
  [-3, 11, "w"],
  [11, -4, "q"],
];

type Props = {
  // The focus the player holds. The book takes its name.
  focus: GameEntry;
  // Learned spells, oldest first.
  spells: GameEntry[];
  level: number;
  selectedId: string | null;
  onSelect: (entryId: string) => void;
  // Whether a spell is being carried toward the book, or anything at all is held over it.
  carrying: "none" | "dragging" | "over";
  // What letting go on the book would do, and cost.
  note: string;
  // True while the book is working on something that was tried with it.
  busy: boolean;
  // True when the focus was made just now, so the book arrives with a flourish.
  arriving: boolean;
  // The book itself, so a drag can tell when it is over it.
  bookRef: RefObject<HTMLButtonElement | null>;
};

// The player's spellbook, in the board's bottom-left corner from the moment they first make a
// focus. Spells are learned by dropping them on it, anything else dropped on it is tried as a
// combination with the focus, and opening it lists the spells inside.
export function Spellbook({ focus, spells, level, selectedId, onSelect, carrying, note, busy, arriving, bookRef }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Once open, the pages stay open while the player works: dragging bubbles, using the book of
  // discoveries, reading quests. They close on a click on the book itself, or on the bare board.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === root.current?.closest(".board")) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`spellbook ${carrying} ${busy ? "busy" : ""} ${arriving ? "arriving" : ""}`} ref={root}>
      {open && (
        <section className="hud-box spellbook-pages" aria-label="Learned spells">
          <header className="hud-head">
            <h2>Learned Spells</h2>
            <span className="hud-count">{spells.length}</span>
          </header>
          {spells.length === 0 ? (
            <p className="hud-empty">Nothing yet. Drop a spell on the book to learn it. Learning costs gold.</p>
          ) : (
            <ul className="spell-list">
              {spells.map((spell) => (
                <li key={spell.id}>
                  <button
                    className={`spell-row ${canCast(spell, level) ? "" : "gated"} ${spell.id === selectedId ? "selected" : ""}`}
                    onClick={() => onSelect(spell.id)}
                  >
                    <span className="spell-name">{spell.name}</span>
                    <span className="spell-meta">
                      {spell.tier === 0 ? "Cantrip" : `Tier ${spell.tier}`}
                      {spell.school && <span className="spell-school"> · {spell.school}</span>}
                    </span>
                    {!canCast(spell, level) && <span className="spell-gate">Level {spellLevel(spell)} to cast</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {carrying !== "none" && <p className="spellbook-note">{note}</p>}

      <button className="spellbook-book" ref={bookRef} aria-expanded={open} onClick={() => setOpen(!open)}>
        {/* Remounted whenever a spell goes in, which replays the bump. */}
        <svg key={spells.length} className={spells.length > 0 ? "bump" : ""} viewBox="-5 -6 34 24" shapeRendering="crispEdges" aria-hidden="true">
          <Sprite x={0} y={0} rows={BOOK} />
          <g className="book-motes">
            {MOTES.map(([x, y, color]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[color]} />
            ))}
          </g>
        </svg>
        <span className="spellbook-name">{focus.name}</span>
        <span className="spellbook-count">
          {spells.length} {spells.length === 1 ? "spell" : "spells"} learned
        </span>
      </button>
    </div>
  );
}
