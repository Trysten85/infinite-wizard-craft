# Combo Review Handoff: Findings and Proposed Changes

For the agent that runs the combo "bake" program. You haven't seen the conversation that led to this, so this doc has what you need. Context: Infinite Wizard Craft, a cozy, funny, non-violent alchemy-style crafting game. Combos are cached, and the same pair always gives the same result. See `voice.md` for tone and `fantasy-tag-vocabulary.md` for tags. The aim is a reviewed combo database so that (A) most combos need no AI call and (B) when the AI does improvise, the result is right.

## What was reviewed
- The bake produced **727 pairs** from **39 inputs**. That is nearly the full grid (741 possible pairs), so the program forced a result for almost every pair, including unrelated ones.
- Review file: `review.md`. Triage file: `combo-triage.csv` (all 727 rows, auto-flags, and columns for the reviewer's verdict).
- **Do not run `approve 4` on this file.** The model's marks are not reliable (see Issue 2).

## Issues found

### 1. Attractors: each input pulls toward its favorite association
The model grabs one input's strongest association instead of blending both. Result names that repeat:

| Result | Times | Typical inputs |
|---|---|---|
| Fertilizer | 25 | anything with Bat guano, Bone dust |
| Ash | 15 | anything with Smoke |
| Cave | 13 | anything with Bat |
| Mirror | 12 | Silver or Crystal paired with anything |
| Mushroom | 12 | Rotted leaves, Shadow, Bat guano |
| Compost | 12 | Rotted leaves, Bat guano |
| Steel | 12 | Forge, Metal, Fire |
| Soil | 11 | Earth, Bone dust |
| Garden | 10 | Herb, Tree |

Rows with a result name used 5+ times: about 178. 412 distinct result names across 727 rows.

### 2. The model's own marks are not useful
Marks: 2 = 32 rows, 3 = 68, 4 = 335, 5 = 290, unknown = 2. So 86% scored 4-5, including clearly wrong ones (Salt + Crown = Sea, Death + Silver = Mirror, Water + Forge = Sword). The 2-3 marks are mostly honest. Use them only to choose what to review first. Human review is the label.

### 3. Weak or wrong logic
- **Water + Salt = Brine** (scored 5). The plain answer is "Saltwater."
- **Steam + Salt = Sea.** The model's own reason says salt is left behind when steam evaporates, which does not give a sea. "Salt spray" or "Sea mist" fits better.
- Others: Water + Forge = Sword, Water + Death = Moss, Salt + Silver = Mirror.

### 4. Modern or off-world results
About 67 rows (heuristic list, needs human check): Hospital, Locomotive, Firefighter, Selfie, Blood bank, Bathtub, Sandwich, Sulfuric acid, Steam engine, Aquarium, Cocktail. These clash with the cozy fantasy voice.

### 5. Voice problems in descriptions
- About 149 descriptions lean on the same few phrases. Counts across all descriptions: "faint/faintly" about 183, "whisper(s)" about 84, "hum(s)" about 76, "as if" about 68, "lullaby" about 36, "sigh" about 24. The model is probably copying the few-shot examples.
- About 66 descriptions run to 3 sentences. The voice guide says 1-2.
- Some ordinary results carry unneeded magic filler (the Rust description mentions a lullaby and an enchantment).

### 6. Duplicates and name quality
- The same result appears for different pairs (Rust twice, Hospital twice, Fog four times).
- Some results are not real words: Mirrorroom, Mudkitchen, Soil crown.

### 7. What works
Same-element pairs are mostly good: Water + Water = Lake, Fire + Fire = Campfire, Air + Air = Wind, Light + Light = Sun, Death + Death = Graveyard. Keep that pattern.

## Proposed changes

### A. Prompt rules for the combiner
1. Blend both inputs. A result that only reflects one input is wrong.
2. If a plain compound name exists, use it (saltwater, not brine).
3. No modern, industrial, or real-world-brand items. Stay with the cozy fantasy world in `voice.md`.
4. Don't fall back on an input's favorite association unless both inputs justify it.
5. Descriptions are 1-2 sentences. Ban or strongly limit: faint, faintly, whisper, hum, lullaby, sigh, "as if."
6. Pass in the list of existing entry names and tell the model to reuse one when it fits, rather than invent a near-duplicate.
7. Result names must be real, common words or short natural compounds.
8. Return tags from the closed list and a mode field (ordinary or whimsical).

### B. A "no result" outcome (decided for now)
- If a pair has no sensible result, return `no_result` with a short gentle line (for example, "Nothing happens. The kettle looks unimpressed.").
- Cache no-results like any other combo.
- The grid does not need to be filled. Skip pairs that make no sense instead of forcing an answer.

### C. Data and workflow
1. **Held-out set:** set aside about 100 reviewed pairs. Never use them in prompts or training. Score every round against them.
2. **Store the full schema per row:** pair key, result name, tags, element, mode, description, review status, and, for rejected rows, the failure type and the correct answer.
3. **Failure types to record:** attractor, too specific, metaphorical, wrong category, modern/off-world, duplicate name, bad logic.
4. **Canonicalize keys and names:** A+B equals B+A, and keep an alias table (saltwater, salt water).
5. **Check the data as a graph:** results become inputs later, so each reviewed result must make sense when it feeds other combos.
6. **Rejected rows with a correction** become the critic's bad examples.
7. **Review order:** start with the roughly 115 rows that have two or more auto-flags, then the 102 rows the model marked 2-3 or unsure, then spot-check the rest.
8. **Use retrieval before fine-tuning:** for each new pair, pull the 5-8 most similar reviewed pairs into the prompt as examples. Consider fine-tuning only if retrieval and rules plateau.
9. **Stop looping when the held-out score plateaus.** Three to five rounds is a ceiling, not a target.

### D. Deferred: comedy mode (not in v1)
Some pairs have a funny answer built from each input's connotation, such as Bat guano + Crown = Bad King, or Salt + Crown = Salty King. Plan for later:
1. The reviewer writes 10-15 joke pairs by hand as examples.
2. For each pair, the model lists each input's literal meaning and connotations (slang, idioms, reputation), writes about 5 candidate names, and the reviewer picks the best.
3. Picked jokes join the reviewed set and become retrieval examples.
4. Mild humor only. The "no crude content" rule in the guardrails still applies.
Do not build this yet. Reject-with-note is enough for now: if a reviewer sees a funny result, they put it in the notes column of the triage file.

## Acceptance checks for the next bake
- No result name appears for more than a small share of pairs (say, 3 or fewer pairs per name unless the pairs are genuinely related).
- Zero results on the banned modern list.
- 100% of descriptions are 1-2 sentences.
- The overused phrases appear in under 5% of descriptions.
- Salt + Water returns Saltwater.
- Held-out accuracy (reviewer-approved results) rises round over round.

