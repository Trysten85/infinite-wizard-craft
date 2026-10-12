import type { PointerEvent } from "react";
import type { BuildingView, GameEntry, ShiftRules } from "../../src/shared/schema";
import { qualityName } from "./day";
import { EntryBubble } from "./EntryBubble";
import { stockChange, stockChangeText } from "./town";

type Props = {
  plot: number;
  building: BuildingView;
  // Every discovery, by id, so a shelf can show and weigh what is on it.
  entries: Map<string, GameEntry>;
  // What the player is carrying, when it can be stocked, and the shelf it is held over.
  carrying: GameEntry | null;
  over: number | null;
  // Null until the order board has been read, and with it the numbers a quality is weighed by.
  rules: ShiftRules | null;
  busy: boolean;
  onGrab: (event: PointerEvent<HTMLElement>, entry: GameEntry, slot: number) => void;
  onClear: (slot: number) => void;
};

// A building's shelves: one slot for each its tier has. A discovery dropped on a slot is stocked
// there, and while one is carried every slot says what it would do to the building's stock.
// The server owns the quality. This only says which way a change would push it.
export function Shelves({ plot, building, entries, carrying, over, rules, busy, onGrab, onClear }: Props) {
  return (
    <div className="shelves">
      <p className="shelves-head">
        <span className={`quality ${building.quality}`}>{qualityName(building.quality)}</span>
        <span className="town-none">wants {building.wants.join(", ")}</span>
      </p>
      <ul className="stock-slots" aria-label="Shelves">
        {building.stock.map((shelf) => {
          const held = shelf.entry ? entries.get(shelf.entry.id) : undefined;
          const hovered = carrying && over === shelf.slot && rules;
          const wanted = held ? building.wants.filter((want) => held.tags.includes(want)) : [];
          return (
            <li
              key={shelf.slot}
              data-slot={`${plot}:${shelf.slot}`}
              className={`stock-slot ${held ? "filled" : ""} ${carrying ? "ready" : ""} ${over === shelf.slot ? "over" : ""}`}
            >
              {held ? (
                <>
                  <EntryBubble
                    entry={held}
                    disabled={busy}
                    onPointerDown={(event) => onGrab(event, held, shelf.slot)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onClear(shelf.slot);
                    }}
                    title="Drag to move it, or right-click to take it off"
                  />
                  <span className="stock-wants">{wanted.length > 0 ? `brings ${wanted.join(", ")}` : "brings nothing it wants"}</span>
                </>
              ) : (
                <span className="stock-empty">Empty shelf</span>
              )}
              {hovered && (
                <span className="stock-preview">{stockChangeText(stockChange(building, entries, carrying, shelf.slot, rules))}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
