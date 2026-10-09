// Helpers for `npm run eval`: scoring a model's output and laying out the side-by-side report.

export type EvalCall = { purpose: string; ok: boolean; latencyMs: number; error?: string };

export type EvalCase = {
  set: string;
  title: string;
  // What the model produced, as text to read. "FAILED: ..." if it never passed the checks.
  output: string;
  // For cases with a right answer, whether the model got it.
  correct?: boolean;
};

export type EvalRun = { model: string; cases: EvalCase[]; calls: EvalCall[]; inventedNames: string[]; seconds: number };

const SENTENCE_END = /[.!?…:;]["'”’)]*$/;
const OPENERS = /^["'“‘(]+/;

// Capitalised words in the middle of a sentence that the game does not know: the model's own
// invented names, such as "Moonpetal". Names the caller lists as known (people, entries) are skipped.
export function findInventedNames(text: string, known: Iterable<string>): string[] {
  const knownWords = new Set([...known].flatMap((name) => name.toLowerCase().split(/[^a-z']+/)).filter(Boolean));
  const found: string[] = [];
  const words = text.split(/\s+/);
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) found.push(current.join(" "));
    current = [];
  };
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!;
    const startsSentence = i === 0 || SENTENCE_END.test(words[i - 1]!) || OPENERS.test(raw);
    const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").replace(/['’]s$/, "");
    const capitalised = /^[A-Z][a-z]+/.test(word);
    if (capitalised && !startsSentence && word !== "I" && !knownWords.has(word.toLowerCase())) current.push(word);
    else flush();
    if (SENTENCE_END.test(raw)) flush();
  }
  flush();
  return [...new Set(found)];
}

function summarise(run: EvalRun) {
  const failed = run.cases.filter((item) => item.output.startsWith("FAILED")).length;
  const rerolls = run.calls.filter((call) => !call.ok).length;
  const judged = run.cases.filter((item) => item.correct !== undefined);
  const byPurpose = new Map<string, number[]>();
  for (const call of run.calls) byPurpose.set(call.purpose, [...(byPurpose.get(call.purpose) ?? []), call.latencyMs]);
  const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    failed,
    rerolls,
    calls: run.calls.length,
    rightAnswers: `${judged.filter((item) => item.correct).length} of ${judged.length}`,
    secondsPerCall: average(run.calls.map((call) => call.latencyMs)) / 1000,
    secondsByPurpose: [...byPurpose].map(([purpose, values]) => ({ purpose, seconds: average(values) / 1000 })),
  };
}

// The whole report as Markdown: a summary table, then every case with each model's output in turn.
export function renderEvalReport(runs: EvalRun[], when: string): string {
  const summaries = runs.map(summarise);
  const row = (label: string, cell: (index: number) => string) => `| ${label} | ${runs.map((_, index) => cell(index)).join(" | ")} |`;
  const lines = [
    `# Model comparison, ${when}`,
    "",
    `| | ${runs.map((run) => run.model).join(" | ")} |`,
    `|---|${runs.map(() => "---|").join("")}`,
    row("Cases that failed outright", (i) => String(summaries[i]!.failed)),
    row("Rerolls (a rule was broken and it had to try again)", (i) => `${summaries[i]!.rerolls} in ${summaries[i]!.calls} calls`),
    row('Right answers where there is one ("none", naming the thing)', (i) => summaries[i]!.rightAnswers),
    row("Invented names in event text", (i) => String(runs[i]!.inventedNames.length)),
    row("Average seconds per call", (i) => summaries[i]!.secondsPerCall.toFixed(1)),
    row("Whole run, minutes", (i) => (runs[i]!.seconds / 60).toFixed(1)),
    "",
    "## Seconds per call, by kind",
    "",
    `| Kind | ${runs.map((run) => run.model).join(" | ")} |`,
    `|---|${runs.map(() => "---|").join("")}`,
  ];
  const purposes = [...new Set(summaries.flatMap((summary) => summary.secondsByPurpose.map((item) => item.purpose)))];
  for (const purpose of purposes) {
    lines.push(row(purpose, (i) => summaries[i]!.secondsByPurpose.find((item) => item.purpose === purpose)?.seconds.toFixed(1) ?? "-"));
  }
  lines.push("", "## Why it had to try again", "");
  for (const run of runs) {
    const reasons = new Map<string, number>();
    for (const call of run.calls.filter((item) => !item.ok)) {
      const reason = (call.error ?? "unknown").split("\n")[0]!.slice(0, 110);
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    lines.push(`**${run.model}**`, "");
    lines.push(...(reasons.size === 0 ? ["- Never."] : [...reasons].map(([reason, count]) => `- ${count} x ${reason}`)), "");
    if (run.inventedNames.length > 0) lines.push(`Invented names: ${run.inventedNames.join(", ")}`, "");
  }

  const sets = [...new Set(runs.flatMap((run) => run.cases.map((item) => item.set)))];
  for (const set of sets) {
    lines.push(`## ${set}`, "");
    const titles = [...new Set(runs.flatMap((run) => run.cases.filter((item) => item.set === set).map((item) => item.title)))];
    for (const title of titles) {
      lines.push(`### ${title}`, "");
      for (const run of runs) {
        const found = run.cases.find((item) => item.set === set && item.title === title);
        const mark = found?.correct === undefined ? "" : found.correct ? " (right)" : " (WRONG)";
        lines.push(`**${run.model}**${mark}`, "", found?.output ?? "(not run)", "");
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
