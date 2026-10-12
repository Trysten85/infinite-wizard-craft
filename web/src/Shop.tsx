import type { ShopSlot, ShopView } from "../../src/shared/schema";
import { EntryBubble } from "./EntryBubble";
import { Gold } from "./Gold";
import { kindLabel } from "./kinds";
import { Shopkeeper } from "./Shopkeeper";

// How many empty shelf spaces to draw while the stock is still loading.
const SHELF_SPACES = 6;

type Props = {
  // Null until the shop's stock has loaded.
  view: ShopView | null;
  gold: number;
  // The slot being bought right now, if any. Nothing else can be bought until it finishes.
  buying: number | null;
  onBuy: (slot: ShopSlot) => void;
};

// The shop's page in the book: what is on the shelf today, and the shopkeeper who sells it.
export function Shop({ view, gold, buying, onBuy }: Props) {
  return (
    <section className="shop" aria-label="Shop">
      <h2 className="page-title">The Shop</h2>
      <p className="purse">
        Your purse <Gold amount={gold} label />
      </p>

      <ul className="shelf">
        {view
          ? view.slots.map((slot) => <ShelfSlot key={slot.slot} slot={slot} gold={gold} busy={buying !== null} onBuy={onBuy} />)
          : Array.from({ length: SHELF_SPACES }, (_, space) => <li key={space} className="shelf-slot" aria-hidden="true" />)}
      </ul>

      <Shopkeeper />
      <p className="shop-note">{view ? restockNote(view.restockIn) : "The shopkeeper is setting out his stock."}</p>
    </section>
  );
}

function restockNote(discoveries: number): string {
  return `New stock after ${discoveries} more ${discoveries === 1 ? "discovery" : "discoveries"} of your own.`;
}

function ShelfSlot({ slot, gold, busy, onBuy }: { slot: ShopSlot; gold: number; busy: boolean; onBuy: (slot: ShopSlot) => void }) {
  const short = slot.price - gold;
  return (
    <li className={`shelf-slot ${slot.sold ? "sold" : ""}`} title={slot.entry.description}>
      <p className={`shelf-kind ${slot.entry.kind}`}>{kindLabel(slot.entry)}</p>
      <EntryBubble entry={slot.entry} tabIndex={-1} aria-hidden="true" />
      {slot.reason && <p className="shelf-reason">{slot.reason}</p>}
      {slot.sold ? (
        <p className="shelf-sold">Sold</p>
      ) : (
        <button
          className="buy"
          disabled={busy || short > 0}
          title={short > 0 ? `You need ${short} more gold.` : undefined}
          onClick={() => onBuy(slot)}
        >
          <span>
            Buy <span className="sr-only">{slot.entry.name} for</span>
          </span>
          <Gold amount={slot.price} />
        </button>
      )}
    </li>
  );
}
