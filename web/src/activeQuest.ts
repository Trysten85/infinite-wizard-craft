import type { QuestProgress } from "../../src/shared/schema";

// A quest the player could be working on right now: not finished, and not waiting on a level.
export function isOpen(quest: QuestProgress): boolean {
  return quest.state === "active" || quest.state === "upcoming";
}

// The quest the player is following. It is the one they picked, for as long as it stays open.
// Otherwise it is the one the server puts first, or failing that any open quest.
export function activeQuest(quests: QuestProgress[], pickedId: string | null): QuestProgress | null {
  return (
    quests.find((quest) => quest.id === pickedId && isOpen(quest)) ??
    quests.find((quest) => quest.state === "active") ??
    quests.find(isOpen) ??
    null
  );
}
