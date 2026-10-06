import { MAX_TAGS, type GameEntry } from "../shared/schema";
import type { GameData } from "./gameData";
import type { Store } from "./store";

export type TagReview = {
  entry: GameEntry;
  // Tags on the entry that are no longer in the vocabulary.
  retired: string[];
  // The word the model said was missing, if any.
  suggestion?: string;
};

// Everything a human should look at: entries with no tags, a model hint, or retired tags.
export function listTagReviews(data: GameData, store?: Store): TagReview[] {
  const reviews: TagReview[] = [];
  for (const entry of data.entries.values()) {
    if (entry.tags.length === 0) reviews.push({ entry, retired: [] });
  }
  for (const entry of store?.listEntries() ?? []) {
    const retired = entry.tags.filter((tag) => !data.tags.has(tag));
    const suggestion = store!.getTagSuggestion(entry.id);
    if (entry.tags.length === 0 || retired.length > 0 || suggestion) reviews.push({ entry, retired, suggestion });
  }
  return reviews;
}

// Sets a generated entry's tags after review. A human may use any tag, including author-only ones.
export function retagEntry(data: GameData, store: Store, id: string, tags: string[]): void {
  if (data.entries.has(id)) throw new Error(`"${id}" is hand-written. Edit its tags in data/entries.json.`);
  const unknown = tags.filter((tag) => !data.tags.has(tag));
  if (unknown.length > 0) throw new Error(`Not in the tag vocabulary: ${unknown.join(", ")}`);
  if (tags.length > MAX_TAGS) throw new Error(`An entry can have at most ${MAX_TAGS} tags.`);
  if (!store.setEntryTags(id, [...new Set(tags)])) throw new Error(`No generated entry "${id}".`);
}
