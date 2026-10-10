import type { Store } from "./store";

// How many things a player has discovered by combining. Things bought or given are left out, so
// that neither a purchase nor a gift brings on a shop restock or a work shift.
export function craftedCount(store: Pick<Store, "getDiscoveries" | "getLedgerRefs">, player: string): number {
  return store.getDiscoveries(player).length - store.getLedgerRefs(player, "shop").length - store.getLedgerRefs(player, "gift").length;
}
