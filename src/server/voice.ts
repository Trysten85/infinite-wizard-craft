// The voice guide includes sample lines for tone. Small models tend to copy them word for word,
// so generated text is checked against them.

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

// Returns a check that gives a reason when the text reuses a run of words from a quoted sample
// in the voice guide, or opens by repeating the thing's own name as a label.
export function createVoiceCheck(voice: string, runLength = 4): (text: string, name?: string) => string | null {
  const runs = new Set<string>();
  for (const [, sample] of voice.matchAll(/"([^"]{12,})"/g)) {
    const sampleWords = words(sample!);
    for (let i = 0; i + runLength <= sampleWords.length; i++) runs.add(sampleWords.slice(i, i + runLength).join(" "));
  }
  return (text, name) => {
    if (name && text.toLowerCase().startsWith(`${name.toLowerCase()}:`)) return "Do not start the description with the name and a colon.";
    const textWords = words(text);
    for (let i = 0; i + runLength <= textWords.length; i++) {
      if (runs.has(textWords.slice(i, i + runLength).join(" "))) {
        return "That copies a sample line from the style guide. Write a new line of your own.";
      }
    }
    return null;
  };
}
