import { z } from "zod";
import type { Blocklist } from "../blocklist";
import { generateValidated } from "../llm/generate";
import type { LlmClient } from "../llm/types";
import type { ModelCall } from "../store";
import { countSentences, createVoiceCheck, endsCleanly } from "../voice";

// What the beat writer is told. The person is given, not invented: every fact comes from
// data/cast.json. Code has already decided the beat is played; the model only writes the scene.
export type BeatBrief = {
  person: { name: string; pronoun: "she" | "he" | "they"; personality: string; voice: string; traits: string[]; facts: string[] };
  beat: { title: string; premise: string };
  // Everyone else the scene may name. Nobody outside this list is brought in.
  others: string[];
};

export interface StoryWriter {
  writeBeat(brief: BeatBrief): Promise<string>;
}

// The most sentences a beat may run to: two to four of scene, and one or two lines.
const MAX_SENTENCES = 7;

// Everything a written beat must satisfy that a schema cannot express. Returns the reason, or null.
export function checkBeat(text: string, checks: { blocklist?: Blocklist; voiceCheck?: (text: string) => string | null } = {}): string | null {
  if (!endsCleanly(text)) return "It must end with a full stop or a closing quote, finishing its sentence.";
  if (/\d/.test(text)) return "No numbers.";
  if (countSentences(text) > MAX_SENTENCES) return "Too long. Two to four sentences of scene, then one or two lines from the person.";
  if (/\b(fondness|takings|cheer|quality|gold|level)\b/i.test(text)) return "Never mention fondness, takings, cheer, quality, gold, or levels.";
  if (checks.blocklist && checks.blocklist.find(text).length > 0) return "It uses a name that is not allowed. Use only the people named in the brief.";
  return checks.voiceCheck?.(text) ?? null;
}

export function renderBeat(brief: BeatBrief): string {
  const { person, beat } = brief;
  return [
    `The person: ${person.name} (${person.pronoun}). ${person.personality}`,
    `How they speak: ${person.voice}`,
    `Traits: ${person.traits.join(", ") || "none given"}.`,
    `Facts (fixed; use one if it helps, never contradict one): ${person.facts.join(" ") || "none given"}`,
    "",
    `The beat: ${beat.title}.`,
    `What happens: ${beat.premise}`,
    "",
    brief.others.length > 0 ? `Others the scene may name: ${brief.others.join(", ")}.` : "Name nobody but this person and the player.",
  ].join("\n");
}

// Writes story beats with the language model, rerolling anything that breaks the rules. The
// story guide (prompts/story.md) and the voice guide are its rules.
export function createModelStoryWriter(deps: { client: LlmClient; log: (call: ModelCall) => void; voice: string; story: string; blocklist?: Blocklist }): StoryWriter {
  const voiceCheck = createVoiceCheck(`${deps.voice}\n${deps.story}`);
  const system = [deps.voice.trim(), "", deps.story.trim(), "", "Write the story beat you are given, addressed to the player as 'you'. Plain text only."].join("\n");
  return {
    async writeBeat(brief) {
      const { text } = await generateValidated(deps.client, deps.log, {
        purpose: "story-beat",
        system,
        prompt: renderBeat(brief),
        schema: z.strictObject({ text: z.string().min(1).max(1200) }),
        reject: (value) => checkBeat(value.text, { blocklist: deps.blocklist, voiceCheck }),
        maxAttempts: 4,
        temperature: 0.8,
      });
      return text.replace(/\*/g, "").trim();
    },
  };
}
