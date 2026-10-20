import type { GameData } from "../gameData";
import type { Store } from "../store";
import type { StoryWriter } from "./writer";

export type StoryService = ReturnType<typeof createStory>;

// Each beat a player has played, in the order played, with its words: the model's once written,
// the beat's plain line until then.
export function playedScenes(data: GameData, store: Store, player: string): { beat: string; person: string; title: string; text: string }[] {
  const written = store.getBeatScenes(player);
  return store.getLedgerRefs(player, "beat").flatMap((id) => {
    const person = data.cast.people.find((each) => each.beats.some((beat) => beat.id === id));
    const beat = person?.beats.find((each) => each.id === id);
    return person && beat ? [{ beat: id, person: person.job, title: beat.title, text: written.get(id) ?? beat.line }] : [];
  });
}

// The words of the story beats a player has played. Code plays a beat (in `settle`); this has the
// model write its scene afterwards, out of sight, and keeps it. Until then, and if the model
// cannot write one within the rules, the beat's own plain `line` stands.
export function createStory(deps: { data: GameData; store: Store; writer?: StoryWriter }) {
  const { data, store, writer } = deps;
  const writing = new Map<string, Promise<void>>();
  const beatsById = new Map(data.cast.people.flatMap((person) => person.beats.map((beat) => [beat.id, { person, beat }] as const)));

  async function writeMissing(player: string): Promise<void> {
    for (;;) {
      const written = store.getBeatScenes(player);
      const id = store.getLedgerRefs(player, "beat").find((beat) => beatsById.has(beat) && !written.has(beat));
      if (!id || !writer) return;
      const { person, beat } = beatsById.get(id)!;
      let text = beat.line;
      try {
        text = await writer.writeBeat({
          person: { name: person.name, pronoun: person.pronoun, personality: person.personality, voice: person.voice, traits: person.traits, facts: person.facts },
          beat: { title: beat.title, premise: beat.premise },
          others: data.cast.people.filter((other) => other.id !== person.id).map((other) => other.name),
        });
      } catch (err) {
        console.error(`Could not write the beat ${id} for ${player}:`, err instanceof Error ? err.message : err);
      }
      // The plain line is kept too, so a beat the model cannot write is not tried every time.
      store.setBeatScene(player, id, text);
    }
  }

  // Starts writing any played beat's scene in the background. Call it after anything the player does.
  function prepare(player: string): void {
    if (!writer || writing.has(player)) return;
    const job = writeMissing(player)
      .catch((err) => console.error(`Could not write beats for ${player}:`, err instanceof Error ? err.message : err))
      .finally(() => writing.delete(player));
    writing.set(player, job);
  }

  async function idle(player: string): Promise<void> {
    while (writing.has(player)) await writing.get(player);
  }

  return { prepare, idle };
}
