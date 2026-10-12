import type { QualityId, ShiftRules } from "../../src/shared/schema";

// How to say a previewed result before the player confirms: the likeliest quality, and the
// worst and best it could come out when luck can move it, such as "Likely Great (Good to Perfect)".
export function previewText(range: { low: QualityId; likely: QualityId; high: QualityId }, rules: ShiftRules): string {
  const name = (id: QualityId) => rules.qualities.find((quality) => quality.id === id)?.name ?? id;
  const likely = `Likely ${name(range.likely)}`;
  return range.low === range.high ? likely : `${likely} (${name(range.low)} to ${name(range.high)})`;
}
