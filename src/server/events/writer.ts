import { z } from "zod";
import type { ResponseType, Stakes } from "../../shared/schema";
import type { Blocklist } from "../blocklist";
import { generateValidated } from "../llm/generate";
import type { LlmClient } from "../llm/types";
import type { ModelCall, Pronoun } from "../store";
import { createVoiceCheck, endsCleanly } from "../voice";

// Everything the writer is told. It never sees a number: code owns those.
export type EventBrief = {
  // An event is a short conversation. "arrival" is the person turning up with something plainly on
  // their mind. "heart" is them saying what they are really after, once the player has responded.
  stage: "arrival" | "heart";
  // At the heart: how the event opened, what the player did, and how the person took it.
  soFar: { scene: string; choice: string; reaction: string } | null;
  seed: { premise: string; kind: string; mood: string[] };
  stakes: Stakes;
  player: { job: string | null; topTags: string[]; repBand: string };
  // A returning person comes with their fixed record and a short history. A new one is invented.
  person:
    | { returning: false }
    | { returning: true; name: string; pronoun?: Pronoun | null; role: string; traits: string[]; facts: string[]; feeling: string; followUp: string | null; history: string[] };
  // One line each for the last few events, whoever they involved.
  recent: string[];
  responseTypes: ResponseType[];
  // Names already used for people this player knows.
  takenNames: string[];
};

export type WrittenEvent = {
  scene: string;
  sceneSummary: string;
  person: { name: string; pronoun?: Pronoun; role: string; traits: string[]; facts: string[] } | null;
  responses: { type: ResponseType; text: string; outcome: string }[];
};

// A second look at a finished scene: would one of the player's spells plainly solve it?
export type SpellQuestion = {
  scene: string;
  personName: string;
  spells: { id: string; name: string; school: string; tags: string[] }[];
};
// `spellId` is null when no spell fits, which is the usual answer.
export type SpellAnswer = { spellId: string | null; text: string; outcome: string };

// What a person leaves the player with as they go, decided by code. The writer only puts it into
// one line of the person's speech.
export type PartingQuestion = {
  kind: "request" | "hint" | "gift";
  // The thing asked for, hinted at, or given, and for a hint, what it is made from.
  name: string;
  madeFrom: string;
  person: { name: string; role: string; traits: string[] };
  // How the visit ended, for the line to follow on from.
  ending: string;
};

export interface EventWriter {
  write(brief: EventBrief): Promise<WrittenEvent>;
  checkSpell(question: SpellQuestion): Promise<SpellAnswer>;
  writeParting(question: PartingQuestion): Promise<string>;
}

// A parting line must name the thing, finish its sentence, and keep to the usual rules.
export function checkParting(question: PartingQuestion, line: string, blocklist?: Blocklist): string | null {
  if (!line.toLowerCase().includes(question.name.toLowerCase())) return `The line must contain the exact word "${question.name}".`;
  if (!endsCleanly(line)) return "The line stops in the middle of a sentence. Finish it.";
  if (/[0-9!]/.test(line)) return "Do not use digits or exclamation marks.";
  if (blocklist && blocklist.find(line).length > 0) return "A name in the line is not available. Use different names.";
  return null;
}

// A plain parting line that needs no model. Used when the model cannot produce one that names the thing.
export function plainParting(question: PartingQuestion): string {
  const { person, name, madeFrom } = question;
  if (question.kind === "request") return `On the way out, ${person.name} turns back. "If you ever come by some ${name}, I would be glad of it."`;
  if (question.kind === "hint") return `At the door, ${person.name} adds, "You know, ${name} comes from ${madeFrom}. I thought you might like to know."`;
  return `Before leaving, ${person.name} presses something into your hands. "Take this ${name}. I have no use for it, and you might."`;
}

// What a spell answer must satisfy. Returns the reason it fails, or null.
export function checkSpellAnswer(question: SpellQuestion, answer: SpellAnswer, blocklist?: Blocklist): string | null {
  if (answer.spellId === null) return null;
  const spell = question.spells.find((item) => item.id === answer.spellId);
  if (!spell) return "Choose one of the listed spells, or none.";
  if (!answer.text.toLowerCase().includes(spell.name.toLowerCase())) return `The response line must name the spell: ${spell.name}.`;
  if (FIRST_PERSON.test(answer.text)) return SAY_YOU;
  for (const text of [answer.text, answer.outcome]) {
    if (text.trim() === "") return "Write both the response line and its outcome.";
    if (!endsCleanly(text)) return "A line stops in the middle of a sentence. Finish every sentence, and keep it short.";
    if (/[0-9!]/.test(text)) return "Do not use digits or exclamation marks anywhere.";
    if (/\b(xp|shop rep)\b/i.test(text)) return "Never mention experience points, standing scores, or any game term.";
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
// A first name and a last name, or an honorific and a name: Pim Kettlebrook, Auntie Wren.
const NAME_PATTERN = /^[A-Z][A-Za-z'’-]+( [A-Z][A-Za-z'’-]+){1,2}$/;
// A response is something the player does, so it is never told as "I".
const FIRST_PERSON = /^["'‘“]?I\b/;
const SAY_YOU = "Write each response as what the player does: 'You offer them a seat.' Never 'I offer them a seat.'";

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
    if (!NAME_PATTERN.test(written.person.name)) return "Give the person a first name and a last name, each capitalised.";
    if (brief.takenNames.some((name) => name.toLowerCase() === written.person!.name.toLowerCase())) {
      return "The player already knows someone by that name. Choose a different name.";
    }
  }

  if (written.responses.some((response) => FIRST_PERSON.test(response.text))) return SAY_YOU;

  const texts = [written.scene, written.sceneSummary, ...written.responses.flatMap((r) => [r.text, r.outcome])];
  const personText = written.person ? [written.person.name, written.person.role, ...written.person.traits, ...written.person.facts] : [];
  for (const text of [...texts, ...personText]) {
    if (/[0-9!]/.test(text)) return "Do not use digits or exclamation marks anywhere.";
    if (/\b(xp|shop rep)\b/i.test(text)) return "Never mention experience points, standing scores, or any game term.";
    if (checks.blocklist && checks.blocklist.find(text).length > 0) return "A name in the text is not available. Use different names.";
  }
  for (const text of texts) {
    if (text !== "" && !endsCleanly(text)) return "A line stops in the middle of a sentence. Finish every sentence, and keep each response to one or two short ones.";
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
      ...(person.pronoun ? [`Always refer to them as "${person.pronoun}".`] : []),
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
  if (brief.stage === "arrival") {
    lines.push(
      "",
      "Write only the arrival. The person turns up and something is plainly on their mind, but they have not said what.",
      "Do not explain the problem yet and do not resolve anything. End on them hesitating, or about to speak.",
      "Each response is how the player first reacts, and each outcome is one sentence: how the person takes it.",
      "The player does not know what is wrong yet, so no response mentions the problem. They welcome the person, wait, or wave them off.",
    );
  } else {
    lines.push(
      "",
      "How it began:",
      brief.soFar!.scene,
      `What the player did: ${brief.soFar!.choice}`,
      `How the person took it: ${brief.soFar!.reaction}`,
      "",
      "Now write the heart of it. The person says what they are really after: something they are looking for, a favour they need, or simply someone to listen.",
      `What comes out must be the premise itself: ${brief.seed.premise}. Do not swap it for a different problem.`,
      "Carry on from what has already happened. Do not repeat it.",
      "Each response is what the player does about it, and each outcome is how the visit ends.",
    );
  }
  lines.push("", "Write one response of each of these types:", ...brief.responseTypes.map((type) => `- ${type}: ${TYPE_MEANING[type]}`));
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
    "You write one small event in the player's working life, from a premise. It is told in two parts, and you are asked for one part at a time.",
    "Use the premise and mood as a starting point, then invent freely: the setting, the problem, and the details.",
    "It should read as a conversation with a person, not a report. Let them speak.",
    "Keep the world ordinary. Food, drink, plants, and tools are real, everyday ones: chamomile, shortbread, a kettle, a hammer. Never invent a named herb, potion, tea, or material.",
    "scene: two or three sentences, addressed to the player as 'you'.",
    "sceneSummary: one plain sentence saying what happened, for the record.",
    "person: when the main person is new, their first and last name, the pronoun used for them (she, he, or they), a short role (neighbor, customer, inspector), one to three trait words, and up to three small facts. When they are already known, null.",
    "Use that one pronoun for the person every time.",
    "responses: for each response type asked for, one sentence of under twenty words saying what the player does, labeled with its type, and an outcome of one or two sentences saying how it turns out.",
    "Write each response as 'You ...'. Never as 'I ...'.",
    "person.role is two or three words at most.",
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
    "text: one sentence of under twenty words in which the player uses the spell, naming it. Write it as 'You ...', never 'I ...'.",
    "outcome: one or two sentences saying how that turns out. It goes well, at no cost to the player.",
    "If none fits, leave text and outcome empty.",
  ].join("\n");

  const PARTING: Record<PartingQuestion["kind"], (q: PartingQuestion) => string> = {
    request: (q) => `${q.person.name} asks the player to make or bring them some ${q.name}.`,
    hint: (q) => `${q.person.name} mentions, in passing, that ${q.name} comes from ${q.madeFrom}. The player has never made ${q.name}.`,
    gift: (q) => `${q.person.name} gives the player ${q.name}, as thanks.`,
  };
  const partingSystem = [
    deps.voice.trim(),
    "",
    "A visit is ending. Write the one last thing the visitor says or does as they go.",
    "One or two short sentences, with their words in quotation marks. Keep it in their character.",
    "It must contain the exact name of the thing, spelled exactly as given, as an ordinary word in the sentence. No asterisks or other marks around it.",
    "Do not bring up anything else by name. Just this one thing.",
  ].join("\n");

  return {
    async writeParting(question) {
      const { line } = await generateValidated(deps.client, deps.log, {
        purpose: "event-parting",
        system: partingSystem,
        prompt: [
          `The visitor: ${question.person.name}, ${question.person.role} (${question.person.traits.join(", ")}).`,
          `How the visit ended: ${question.ending}`,
          `What happens now: ${PARTING[question.kind](question)}`,
          `The exact name to use: ${question.name}`,
        ].join("\n"),
        schema: z.strictObject({ line: z.string().min(1).max(400) }),
        reject: (value) => checkParting(question, value.line, deps.blocklist),
        maxAttempts: 3,
        temperature: 0.6,
      });
      // The model likes to put the name in asterisks for emphasis. The page shows plain text.
      return line.replace(/\*/g, "");
    },

    async checkSpell(question) {
      const NONE = "none";
      const schema = z.strictObject({
        spell: z.enum([NONE, ...question.spells.map((spell) => spell.id)]),
        text: z.string().max(400),
        outcome: z.string().max(700),
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
        scene: z.string().min(1).max(1400),
        sceneSummary: z.string().min(1).max(400),
        // The schema itself settles whether a person is invented, so the model cannot get it wrong:
        // someone already known is always null, and someone new is always described.
        person: brief.person.returning
          ? z.null()
          : z.strictObject({
              name: z.string().min(1).max(60),
              pronoun: z.enum(["she", "he", "they"]),
              role: z.string().min(1).max(80),
              traits: z.array(z.string().min(1).max(40)).min(1).max(3),
              facts: z.array(z.string().min(1).max(240)).max(3),
            }),
        responses: z
          .array(z.strictObject({ type: z.enum(brief.responseTypes as [ResponseType, ...ResponseType[]]), text: z.string().min(1).max(400), outcome: z.string().min(1).max(700) }))
          .length(brief.responseTypes.length),
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
    async writeParting(question) {
      return plainParting(question);
    },

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
        scene:
          brief.stage === "arrival"
            ? `${who} turns up while you are working, with something plainly on their mind.`
            : `${who} explains. ${brief.seed.premise}. It is a ${STAKES_WORD[brief.stakes]} matter, and they are waiting to see what you do.`,
        sceneSummary: `${who} came by: ${brief.seed.premise.toLowerCase()}.`,
        person: brief.person.returning ? null : { name: free, pronoun: "they", role: "neighbor", traits: ["cheerful"], facts: [] },
        responses: brief.responseTypes.map((type) => ({
          type,
          text: `Be ${type} about it.`,
          outcome: `You chose to be ${type}, and ${who} took note.`,
        })),
      };
    },
  };
}
