import type { CachedCombo } from "./store";

// What deleting one cached combination would take with it: the ids of the generated things that
// would be removed. A thing goes when nothing else makes it, and so does everything made from it.
// This only works it out. `store.deleteCombo` is what deletes.
export function goesWith(combos: CachedCombo[], key: string): string[] {
  let left = [...combos];
  const removed: string[] = [];
  const remove = (target: string): void => {
    const combo = left.find((item) => item.key === target);
    if (!combo) return;
    left = left.filter((item) => item.key !== target);
    if (left.some((item) => item.resultId === combo.resultId)) return;
    removed.push(combo.resultId);
    for (const dependent of left.filter((item) => item.a === combo.resultId || item.b === combo.resultId)) remove(dependent.key);
  };
  remove(key);
  return removed;
}
