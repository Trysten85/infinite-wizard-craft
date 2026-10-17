import { z } from "zod";
import type { Blocklist } from "../blocklist";
import { generateValidated } from "../llm/generate";
import type { LlmClient } from "../llm/types";
import type { ModelCall } from "../store";
import { createVoiceCheck, endsCleanly } from "../voice";

// What the order writer is told. Code has already chosen the tags and the tier: the writer only
// finds words for them.
export type OrderBrief = {
  job: string;
  // What this job's orders tend to be about.
  flavor: string;
  // A seed for what the order is about. The writer may use it or invent something near it.
  subject: string;
  // Every tag the order asks for, with the plain words the order must use for it.
  tags: { tag: string; words: string }[];
  // The job's other subjects, for the range of things an order can be about.
  subjects: string[];
  // Orders already on the board and ones lately finished. The new one must not read like these.
  others: string[];
};

export interface OrderWriter {
  write(brief: OrderBrief): Promise<string>;
}

// Shapes an order can take, so the writer has a spread to work from and nothing to copy. They are
// for other trades than any real one, and none of them is worded as a template.
const EXAMPLES = [
  "The mill needs its flour sifted twice before the baker's cart comes. Something dry and fine will do.",
  "Mrs Ashgrove wants her gate to stop squeaking. She is not fussy about how, but it must be quiet.",
  "Somebody has left a harp in the rain and would like it to forget the whole thing.",
  "Two brothers are sharing a sled and neither will say sorry. Whatever you send must be warm and patient.",
  "A heron has settled on the pond and will not move. It wants something shiny and a little respect.",
  "For the harvest dance: lanterns that will not blow out, and a tune that will not stick in anyone's head.",
  "The ferryman's lamp keeps going out at the worst bend of the river. Give it something that glows and stays.",
  "A small order, really. The vicar's hat is too tall for the door and he is too proud to duck.",
  "Nobody on Crumb Lane can agree on the colour of the new shutters. Settle it with something bright.",
  "The goats have learned to open the latch. Think of something clever and a bit rude.",
];

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

// Words too common to say that two orders are alike.
const COMMON = new Set("a an the and or of for to in on at is are was it its that this with who what be by as from but not no so if then than too very just some any one two something".split(" "));

function content(text: string): Set<string> {
  return new Set(words(text).filter((word) => !COMMON.has(word) && word.length > 2));
}

// The reason an order reads like another, or null. Two orders are alike when they open with the
// same three words, or share most of what they say.
export function tooAlike(text: string, others: string[], share = 0.5): string | null {
  const opening = words(text).slice(0, 3).join(" ");
  const mine = content(text);
  for (const other of others) {
    if (opening !== "" && opening === words(other).slice(0, 3).join(" ")) {
      return `It opens the same way as "${other}". Open it differently, and about something else.`;
    }
    const theirs = content(other);
    const shared = [...mine].filter((word) => theirs.has(word)).length;
    const smaller = Math.min(mine.size, theirs.size);
    if (smaller > 0 && shared / smaller > share) {
      return `It says much the same as "${other}". Write about a different thing, in a different shape.`;
    }
  }
  return null;
}

// Everything an order must satisfy that a schema cannot express. Returns the reason it fails, or null.
// Whether the order says this phrase as words of its own, and not inside longer ones: "air" is
// not asked for by a chair, nor "ice" by a price.
function saysWords(text: string, phrase: string): boolean {
  const wanted = words(phrase);
  if (wanted.length === 0) return false;
  const said = words(text);
  return said.some((_, at) => wanted.every((word, step) => said[at + step] === word));
}

export function checkOrder(
  brief: OrderBrief,
  text: string,
  checks: { blocklist?: Blocklist; voiceCheck?: (text: string) => string | null } = {},
): string | null {
  const missing = brief.tags.filter(({ tag, words: phrase }) => !saysWords(text, phrase) && !saysWords(text, tag));
  if (missing.length > 0) {
    return `It must use these words as plain parts of the sentence: ${missing.map((item) => `"${item.words}"`).join(", ")}.`;
  }
  if (!endsCleanly(text)) return "It must end with a full stop, finishing its sentence.";
  if (/\d/.test(text)) return "No numbers.";
  if (text.trim().split(/\s+/).length > 40) return "Too long. One or two short sentences, under forty words.";
  if (/\bcalls for\b/i.test(text)) return 'Do not use the phrase "calls for".';
  if (checks.blocklist && checks.blocklist.find(text).length > 0) return "It uses a name that is not allowed. Write it without any proper names.";
  const voice = checks.voiceCheck?.(text);
  if (voice) return voice;
  return tooAlike(text, brief.others);
}

export function renderOrder(brief: OrderBrief): string {
  return [
    `The trade: ${brief.job}. ${brief.flavor}.`,
    `What it might be about: ${brief.subject}`,
    `Other things orders for this trade are about: ${brief.subjects.join("; ")}.`,
    "",
    `Use each of these as plain words in the order: ${brief.tags.map((item) => `"${item.words}"`).join(", ")}.`,
    brief.others.length > 0
      ? `Orders already on the board or lately done. Yours must not read like any of them, in subject or in shape:\n${brief.others.map((other) => `- ${other}`).join("\n")}`
      : "There are no other orders yet.",
  ].join("\n");
}

// Writes orders with the language model, rerolling anything that breaks a rule or reads like an
// order already on the board.
export function createModelOrderWriter(deps: {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  blocklist?: Blocklist;
  maxAttempts?: number;
  temperature?: number;
}): OrderWriter {
  const voiceCheck = createVoiceCheck(deps.voice);
  const system = [
    deps.voice.trim(),
    "",
    "You write one order for a work board: a small job somebody in town wants done, in one or two short sentences.",
    "It must ask for exactly the things you are given, in plain words, and not for anything more. Work those words into the sentence naturally.",
    "Make each order its own: its own person or thing, its own small trouble, its own shape. Do not open with the same words as another order, and do not follow a pattern such as 'X for Y. It calls for Z.'",
    "Vary how orders begin. Start with a person, a place, a complaint, an object, a deadline, or a plain request, and not with the same kind of start as the orders you are shown.",
    "Keep the world ordinary and a little funny. No injury, cruelty, or real people. No numbers.",
    "Here are shapes orders can take. They are for other trades, so do not copy them or reuse their words:",
    ...EXAMPLES.map((example) => `- ${example}`),
  ].join("\n");

  return {
    async write(brief) {
      const { text } = await generateValidated(deps.client, deps.log, {
        purpose: "shift-order",
        system,
        prompt: renderOrder(brief),
        schema: z.strictObject({ text: z.string().min(1).max(400) }),
        reject: (value) => checkOrder(brief, value.text, { blocklist: deps.blocklist, voiceCheck }),
        maxAttempts: deps.maxAttempts ?? 4,
        temperature: deps.temperature ?? 0.9,
      });
      return text.replace(/\*/g, "").trim();
    },
  };
}
