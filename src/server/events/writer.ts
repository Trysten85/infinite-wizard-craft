import { z } from "zod";
import type { ResponseType, Stakes } from "../../shared/schema";
import type { Blocklist } from "../blocklist";
import { generateValidated } from "../llm/generate";
import type { LlmClient } from "../llm/types";
import type { ModelCall } from "../store";
import { createVoiceCheck } from "../voice";

// Everything the writer is told. It never sees a number: code owns those.
export type EventBrief = {
  seed: { premise: string; kind: string; mood: string[] };
  stakes: Stakes;
  player: { job: string | null; topTags: string[]; repBand: string };
  // A returning person comes with their fixed record and a short history. A new one is invented.
  person:
    | { returning: false }
    | { returning: true; name: string; role: string; traits: string[]; facts: string[]; feeling: string; followUp: string | null; history: string[] };
  // One line each for the last few events, whoever they involved.
  recent: string[];
  responseTypes: ResponseType[];
  // The thing the person asks for if the player helps, when code has planned a request.
  ask: { name: string } | null;
  // Names already used for people this player knows.
  takenNames: string[];
};

export type WrittenEvent = {
  scene: string;
  sceneSummary: string;
  person: { name: string; role: string; traits: string[]; facts: string[] } | null;
  responses: { type: ResponseType; text: string; outcome: string }[];
  ask: string | null;
};

// A second look at a finished scene: would one of the player's spells plainly solve it?
export type SpellQuestion = {
  scene: string;
  personName: string;
  spells: { id: string; name: string; school: string; tags: string[] }[];
};
// `spellId` is null when no spell fits, which is the usual answer.
export type SpellAnswer = { spellId: string | null; text: string; outcome: string };

export interface EventWriter {
  write(brief: EventBrief): Promise<WrittenEvent>;
  checkSpell(question: SpellQuestion): Promise<SpellAnswer>;
}

// What a spell answer must satisfy. Returns the reason it fails, or null.
export function checkSpellAnswer(question: SpellQuestion, answer: SpellAnswer, blocklist?: Blocklist): string | null {
  if (answer.spellId === null) return null;
  const spell = question.spells.find((item) => item.id === answer.spellId);
  if (!spell) return "Choose one of the listed spells, or none.";
  if (!answer.text.toLowerCase().includes(spell.name.toLowerCase())) return `The response line must name the spell: ${spell.name}.`;
  for (const text of [answer.text, answer.outcome]) {
    if (text.trim() === "") return "Write both the response line and its outcome.";
    if (/[0-9!]/.test(text)) return "Do not use digits or exclamation marks anywhere.";
    if (/\b(fondness|reputation|xp)\b/i.test(text)) return "Never mention reputation, fondness, or any game term.";
    if (blocklist && blocklist.find(text).length > 0) return "A name in the text is not available. Use different names.";
  }
  return null;
}

const TYPE_MEANING: Record<ResponseType, string> = {
  generous: "the player pays, gives, or goes out of their way",
  skilled: "the player uses their craft or a spell to solve it",
  fair: "the player does the sensible, ordinary thing",
  sharp: "the player takes advantage, haggles, or cuts a corner",
  avoid: "the player ignores it, refuses, or leaves",
};
const STAKES_WORD: Record<Stakes, string> = { S: "small", M: "middling", L: "large" };
const NAME_PATTERN = /^[A-Z][A-Za-z'’-]+( [A-Z][A-Za-z'’-]+){0,2}$/;

// Everything a written event must satisfy that a schema cannot express. Returns the reason it fails, or null.
export function checkWritten(
  brief: EventBrief,
  written: WrittenEvent,
  checks: { blocklist?: Blocklist; voiceCheck?: (text: string) => string | null } = {},
): string | null {
  const types = written.responses.map((response) => response.type);
  const wanted = [...brief.responseTypes].sort().join(", ");
  if ([...types].sort().join(", ") !== wanted) return `Give exactly one response of each of these types: ${wanted}.`;

  if (brief.person.returning) {
    if (written.person) return "This person is already known. Set person to null and do not rename them.";
  } else {
    if (!written.person) return "Invent the person: a name, a role, one to three traits, and any facts.";
    if (!NAME_PATTERN.test(written.person.name)) return "The person's name must be one to three capitalised words.";
    if (brief.takenNames.some((name) => name.toLowerCase() === written.person!.name.toLowerCase())) {
      return "The player already knows someone by that name. Choose a different name.";
    }
  }

  if (brief.ask && !written.ask) return `Write the ask: one line in which the person asks the player for ${brief.ask.name}.`;
  if (brief.ask && !written.ask!.toLowerCase().includes(brief.ask.name.toLowerCase())) {
    return `The ask must name the thing wanted: ${brief.ask.name}.`;
  }
  if (!brief.ask && written.ask) return "Nobody asks for anything in this event. Set ask to null.";

  const texts = [written.scene, written.sceneSummary, written.ask ?? "", ...written.responses.flatMap((r) => [r.text, r.outcome])];
  const personText = written.person ? [written.person.name, written.person.role, ...written.person.traits, ...written.person.facts] : [];
  for (const text of [...texts, ...personText]) {
    if (/[0-9!]/.test(text)) return "Do not use digits or exclamation marks anywhere.";
    if (/\b(fondness|reputation|xp)\b/i.test(text)) return "Never mention reputation, fondness, or any game term.";
    if (checks.blocklist && checks.blocklist.find(text).length > 0) return "A name in the text is not available. Use different names.";
  }
  for (const text of texts) {
    const echo = checks.voiceCheck?.(text);
    if (echo) return echo;
  }
  return null;
}

// The brief as the writer reads it.
export function renderBrief(brief: EventBrief): string {
  const lines = [
    `Premise: ${brief.seed.premise}.`,
    `Kind of event: ${brief.seed.kind}. Mood: ${brief.seed.mood.join(", ")}. What is at stake is ${STAKES_WORD[brief.stakes]}.`,
    `The player: ${brief.player.job ? `works as a ${brief.player.job}` : "has no trade yet, and is still learning what things make"}.`,
  ];
  if (brief.player.topTags.length > 0) lines.push(`They mostly deal in: ${brief.player.topTags.join(", ")}.`);
  lines.push(`The town thinks of them as: ${brief.player.repBand.toLowerCase()}.`);
  if (brief.person.returning) {
    const person = brief.person;
    lines.push(
      "",
      `The main person is someone the player already knows: ${person.name}, ${person.role} (${person.traits.join(", ")}).`,
      ...(person.facts.length > 0 ? [`Known facts, which must not change: ${person.facts.join("; ")}.`] : []),
      `They are ${person.feeling}.`,
      ...(person.followUp ? [`They have come back because: ${person.followUp}.`] : ["Decide why they have come back."]),
      ...(person.history.length > 0 ? ["What has happened between them so far:", ...person.history.map((line) => `- ${line}`)] : []),
    );
  } else {
    lines.push("", "The main person is someone new. Invent them.");
    if (brief.takenNames.length > 0) lines.push(`Names already taken: ${brief.takenNames.join(", ")}.`);
  }
  if (brief.recent.length > 0) lines.push("", "Recent events, for continuity:", ...brief.recent.map((line) => `- ${line}`));
  lines.push("", "Write one response of each of these types:", ...brief.responseTypes.map((type) => `- ${type}: ${TYPE_MEANING[type]}`));
  lines.push(
    "",
    brief.ask
      ? `If the player helps, the person then asks them to make or bring: ${brief.ask.name}. Write that ask as one line of the person's speech, naming it.`
      : "Nobody asks the player for anything afterwards. Set ask to null.",
  );
  return lines.join("\n");
}

// Writes events with the language model, rerolling anything that breaks the rules.
export function createModelEventWriter(deps: {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  blocklist?: Blocklist;
  maxAttempts?: number;
  temperature?: number;
}): EventWriter {
  const voiceCheck = createVoiceCheck(deps.voice);
  const system = [
    deps.voice.trim(),
    "",
    "You write one small event in the player's working life, from a premise.",
    "Use the premise and mood as a starting point, then invent freely: the setting, the problem, and the details.",
    "scene: three to five sentences, addressed to the player as 'you'.",
    "sceneSummary: one plain sentence saying what happened, for the record.",
    "person: when the main person is new, their name, a short role (neighbor, customer, inspector), one to three trait words, and up to three small facts. When they are already known, null.",
    "responses: one short line for each response type asked for, labeled with its type, and for each an outcome of one or two sentences saying how it turns out.",
    "Each response must really fit its type. A generous response is actually generous.",
    "Never mention money amounts, numbers, or game terms. No injury, cruelty, or real people. Romance stays light.",
  ].join("\n");

  const spellSystem = [
    deps.voice.trim(),
    "",
    "You are given a finished scene and the spells the player knows.",
    "Decide whether one of those spells would plainly solve the problem in the scene, as an ordinary, everyday use of that spell.",
    "Most scenes have no such spell. Answer none unless the fit is obvious to anyone.",
    "The problem must already be in the scene as written. Never invent a problem for a spell to solve.",
    "A spell never forces anyone to do, think, or feel anything, and never harms anyone.",
    "Fits: something is broken and the player knows Mending. A spill or a stain and the player knows Prestidigitation. Something out of reach and the player knows Mage Hand.",
    "Does not fit: a nervous customer and Fire Bolt. A missing delivery and Light.",
    "If a spell fits, also write:",
    "text: one short line in which the player uses the spell, naming it.",
    "outcome: one or two sentences saying how that turns out. It goes well, at no cost to the player.",
    "If none fits, leave text and outcome empty.",
  ].join("\n");

  return {
    async checkSpell(question) {
      const NONE = "none";
      const schema = z.strictObject({
        spell: z.enum([NONE, ...question.spells.map((spell) => spell.id)]),
        text: z.string().max(160),
        outcome: z.string().max(320),
      });
      const toAnswer = (value: z.infer<typeof schema>): SpellAnswer => ({ spellId: value.spell === NONE ? null : value.spell, text: value.text, outcome: value.outcome });
      const result = await generateValidated(deps.client, deps.log, {
        purpose: "event-spell",
        system: spellSystem,
        prompt: [
          `The scene, with ${question.personName}:`,
          question.scene,
          "",
          "Spells the player knows:",
          ...question.spells.map((spell) => `- ${spell.id}: ${spell.name} (${spell.school})`),
        ].join("\n"),
        schema,
        reject: (value) => checkSpellAnswer(question, toAnswer(value), deps.blocklist),
        maxAttempts: 3,
        temperature: 0.4,
      });
      return toAnswer(result);
    },

    async write(brief) {
      const schema = z.strictObject({
        scene: z.string().min(1).max(700),
        sceneSummary: z.string().min(1).max(200),
        person: z
          .strictObject({
            name: z.string().min(1).max(40),
            role: z.string().min(1).max(40),
            traits: z.array(z.string().min(1).max(20)).min(1).max(3),
            facts: z.array(z.string().min(1).max(120)).max(3),
          })
          .nullable(),
        responses: z
          .array(z.strictObject({ type: z.enum(brief.responseTypes as [ResponseType, ...ResponseType[]]), text: z.string().min(1).max(160), outcome: z.string().min(1).max(320) }))
          .length(brief.responseTypes.length),
        ask: z.string().max(200).nullable(),
      });
      return generateValidated(deps.client, deps.log, {
        purpose: "event",
        system,
        prompt: renderBrief(brief),
        schema,
        reject: (written) => checkWritten(brief, written, { blocklist: deps.blocklist, voiceCheck }),
        maxAttempts: deps.maxAttempts ?? 4,
        temperature: deps.temperature ?? 0.8,
      });
    },
  };
}

// A stand-in writer that needs no model. It returns plain, rule-abiding text built from the brief,
// so the rules can be tested, and the game can run, without a model.
export function createCannedEventWriter(): EventWriter {
  const names = ["Pim Kettlebrook", "Odessa Tuck", "Bram Pennywhistle", "Hettie Marrow", "Corwin Dale", "Ida Thistle", "Noll Quince", "Wren Applegate"];
  return {
    // The canned writer reaches for a spell only when the player knows a plainly practical one.
    async checkSpell(question) {
      const spell = question.spells.find((item) => item.tags.includes("utility"));
      if (!spell) return { spellId: null, text: "", outcome: "" };
      return { spellId: spell.id, text: `Sort it out with ${spell.name}.`, outcome: `${spell.name} did the job, and ${question.personName} was impressed.` };
    },

    async write(brief) {
      const free = names.find((name) => !brief.takenNames.includes(name)) ?? `Guest ${brief.takenNames.length + 1}`;
      const who = brief.person.returning ? brief.person.name : free;
      return {
        scene: `${who} turns up while you are working. ${brief.seed.premise}. It is a ${STAKES_WORD[brief.stakes]} matter, and they are waiting to see what you do.`,
        sceneSummary: `${who} came by: ${brief.seed.premise.toLowerCase()}.`,
        person: brief.person.returning ? null : { name: free, role: "neighbor", traits: ["cheerful"], facts: [] },
        responses: brief.responseTypes.map((type) => ({
          type,
          text: `Be ${type} about it.`,
          outcome: `You chose to be ${type}, and ${who} took note.`,
        })),
        ask: brief.ask ? `Could you bring me some ${brief.ask.name}, when you have a moment?` : null,
      };
    },
  };
}
