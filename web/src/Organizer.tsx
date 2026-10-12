import type { PointerEvent } from "react";
import type { GameEntry } from "../../src/shared/schema";
import { ElementDot, EntryBubble } from "./EntryBubble";
import { KINDS, SORTS, organizeEntries, seenElements, type Organize } from "./organize";
import type { TurnDirection } from "./usePageTurn";

const SORT_LABELS: Record<Organize["sort"], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name",
  tier: "Tier",
};

const KIND_LABELS: Record<Organize["kind"], string> = {
  all: "All",
  element: "Elements",
  material: "Materials",
  school: "Schools",
  spell: "Spells",
  job: "Jobs",
};

type Props = {
  entries: GameEntry[];
  organize: Organize;
  selected: GameEntry | undefined;
  // Why the list is empty before the first load: still loading, or the reason it failed.
  status: string;
  // `turn` asks for a page-turn to go with the change. Filter chips turn the page; typing doesn't.
  onOrganize: (next: Organize, turn?: TurnDirection) => void;
  onGrab: (event: PointerEvent<HTMLElement>, entry: GameEntry) => void;
  onSpawn: (entry: GameEntry) => void;
  // Shows an entry's details without putting it on the board.
  onInspect: (entry: GameEntry) => void;
};

export function Organizer({ entries, organize, selected, status, onOrganize, onGrab, onSpawn, onInspect }: Props) {
  const shown = organizeEntries(entries, organize);
  const elements = seenElements(entries);
  // Only kinds the player has found, so the row grows as the game opens up.
  const kinds = KINDS.filter((kind) => kind === "all" || kind === organize.kind || entries.some((e) => e.kind === kind));

  // Clicking the chip that is already picked lets go of it, back to everything.
  function pickKind(clicked: Organize["kind"]) {
    const kind = clicked === organize.kind ? "all" : clicked;
    if (kind === organize.kind) return;
    const later = KINDS.indexOf(kind) > KINDS.indexOf(organize.kind);
    onOrganize({ ...organize, kind }, later ? "forward" : "back");
  }

  function toggleElement(id: string) {
    const picked = organize.elements.includes(id);
    const elements = picked ? organize.elements.filter((other) => other !== id) : [...organize.elements, id];
    onOrganize({ ...organize, elements }, picked ? "back" : "forward");
  }

  return (
    <>
      <h2 className="page-title">Discoveries</h2>
      <div className="organizer-controls">
        <input
          type="search"
          placeholder="Search"
          aria-label="Search discovered"
          value={organize.query}
          onChange={(e) => onOrganize({ ...organize, query: e.target.value })}
        />
        <label className="sort">
          Sort
          <select value={organize.sort} onChange={(e) => onOrganize({ ...organize, sort: e.target.value as Organize["sort"] })}>
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        <div className="chips" role="group" aria-label="Kind">
          {kinds.map((kind) => (
            <button
              key={kind}
              className="chip"
              aria-pressed={organize.kind === kind}
              onClick={() => pickKind(kind)}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Element">
          {elements.map((id) => (
            <button key={id} className="chip" aria-pressed={organize.elements.includes(id)} onClick={() => toggleElement(id)}>
              <ElementDot id={id} />
              <span className="element-name">{id}</span>
            </button>
          ))}
        </div>
        <p className="count">
          {shown.length === entries.length ? `${entries.length} discovered` : `${shown.length} of ${entries.length}`}
        </p>
      </div>

      <ul className="bubble-list">
        {shown.map((entry) => (
          <li key={entry.id}>
            <EntryBubble
              entry={entry}
              className={entry.id === selected?.id ? "selected" : ""}
              title={entry.description}
              onPointerDown={(event) => onGrab(event, entry)}
              onClick={() => onSpawn(entry)}
              onContextMenu={(event) => {
                event.preventDefault();
                onInspect(entry);
              }}
            />
          </li>
        ))}
        {shown.length === 0 && <li className="empty">{entries.length > 0 ? "Nothing matches." : status}</li>}
      </ul>

      <section className="details" aria-live="polite" aria-label="Details">
        {selected ? (
          <>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <p className="meta">
              {selected.kind} · tier {selected.tier} · depth {selected.depth}
              {selected.tags.length > 0 && ` · ${selected.tags.join(", ")}`}
            </p>
          </>
        ) : (
          <p className="meta">Right-click a discovery to read about it.</p>
        )}
      </section>
    </>
  );
}
