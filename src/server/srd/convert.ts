import { z } from "zod";
import { idSchema, type Spell } from "../../shared/schema";
import { parseCost } from "./materials";

// The fields of a 5e-database spell that the import reads. Everything else is ignored.
export const rawSpellSchema = z.object({
  index: idSchema,
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: z.object({ index: idSchema }),
  components: z.array(z.enum(["V", "S", "M"])),
  material: z.string().optional(),
  damage: z.array(z.object({ damage_type: z.object({ index: z.string() }).optional() })).optional(),
  heal_at_slot_level: z.record(z.string(), z.string()).optional(),
  area_of_effect: z.object({ type: z.string() }).optional(),
});
export type RawSpell = z.infer<typeof rawSpellSchema>;

export const overridesSchema = z.record(
  idSchema,
  z.strictObject({ tags: z.array(z.string()).optional(), elements: z.array(idSchema).optional() }),
);
export type SpellOverride = z.infer<typeof overridesSchema>[string];

// The tag a school implies when the spell's own data says nothing more specific.
export const SCHOOL_DEFAULT_TAG: Record<string, string | undefined> = {
  abjuration: "protection",
  conjuration: "summon",
  divination: "knowledge",
  enchantment: "mind",
  illusion: "mind",
  transmutation: "transform",
};

const ENERGY_DAMAGE = new Set(["fire", "cold", "lightning", "thunder", "force"]);

const ELEMENT_FOR_DAMAGE: Record<string, string | undefined> = {
  fire: "fire",
  cold: "water",
  lightning: "air",
  thunder: "air",
  radiant: "light",
  necrotic: "death",
};

function damageTypes(raw: RawSpell): string[] {
  return (raw.damage ?? []).map((d) => d.damage_type?.index).filter((type) => type !== undefined);
}

export function tagsFor(raw: RawSpell): string[] {
  const tags: string[] = [];
  if (raw.damage) tags.push("damage");
  if (damageTypes(raw).some((type) => ENERGY_DAMAGE.has(type))) tags.push("energy");
  if (raw.heal_at_slot_level) tags.push("healing");
  if (raw.area_of_effect) tags.push("area");
  const schoolTag = SCHOOL_DEFAULT_TAG[raw.school.index];
  if (schoolTag) tags.push(schoolTag);
  return [...new Set(tags)];
}

export function elementsFor(raw: RawSpell): string[] {
  const elements = damageTypes(raw)
    .map((type) => ELEMENT_FOR_DAMAGE[type])
    .filter((element) => element !== undefined);
  if (raw.heal_at_slot_level) elements.push("life");
  return [...new Set(elements)];
}

// `materialsByPhrase` maps a material phrase to the material ids extracted from it, once that exists.
export function convertSpell(
  raw: RawSpell,
  override: SpellOverride = {},
  materialsByPhrase: Map<string, string[]> = new Map(),
): Spell {
  const materialText = raw.material ?? null;
  const cost = materialText ? parseCost(materialText) : { costGp: null, consumed: false };
  return {
    id: raw.index,
    name: raw.name,
    tier: raw.level,
    school: raw.school.index,
    elements: override.elements ?? elementsFor(raw),
    tags: override.tags ?? tagsFor(raw),
    components: {
      verbal: raw.components.includes("V"),
      somatic: raw.components.includes("S"),
      material: raw.components.includes("M"),
      materialText,
      materials: materialText ? (materialsByPhrase.get(materialText) ?? []) : [],
      ...cost,
    },
    source: "srd",
  };
}

// A spell whose tags say nothing beyond its school, so a human should look at it.
export function hasThinTags(spell: Spell): boolean {
  const schoolTag = SCHOOL_DEFAULT_TAG[spell.school];
  return spell.tags.length === 0 || (spell.tags.length === 1 && spell.tags[0] === schoolTag);
}
