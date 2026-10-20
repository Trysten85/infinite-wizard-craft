import { Fragment } from "react";
import { PALETTE } from "./pixels";
import { TIME_MARK } from "./timeMark";

// The page's small icons, drawn as pixel art so they look the same in every browser and on every
// phone, which emoji and symbol characters do not. A sprite is rows of letters, one per pixel: a
// palette letter is that colour, `#` is the text colour around it, and a dot is clear.

export const ICONS = {
  hourglass: [
    "bbbbbbb",
    ".k...k.",
    ".kyyyk.",
    "..kyk..",
    "...k...",
    "..k.k..",
    ".k.y.k.",
    ".kyyyk.",
    "bbbbbbb",
  ],
  star: [
    "...y...",
    "..yyy..",
    "yyyyyyy",
    ".yyyyy.",
    "..yyy..",
    ".yy.yy.",
    "y.....y",
  ],
  check: [
    "......#",
    ".....##",
    "#...##.",
    "##.##..",
    ".###...",
    "..#....",
  ],
  cross: [
    "##...##",
    ".##.##.",
    "..###..",
    ".##.##.",
    "##...##",
  ],
  diamond: [
    "..#..",
    ".###.",
    "#####",
    ".###.",
    "..#..",
  ],
  sparkle: [
    "...#...",
    "...#...",
    "..###..",
    "#######",
    "..###..",
    "...#...",
    "...#...",
  ],
  ring: [
    ".###.",
    "#...#",
    "#...#",
    "#...#",
    ".###.",
  ],
  caretDown: [
    "#####",
    ".###.",
    "..#..",
  ],
  caretUp: [
    "..#..",
    ".###.",
    "#####",
  ],
  padlock: [
    "..###..",
    ".#...#.",
    ".#...#.",
    "#######",
    "###.###",
    "###.###",
    "#######",
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

// One rectangle for each run of the same letter along a row.
function runs(rows: readonly string[]): { x: number; y: number; width: number; letter: string }[] {
  return rows.flatMap((row, y) => {
    const found: { x: number; y: number; width: number; letter: string }[] = [];
    for (let start = 0; start < row.length; ) {
      let end = start + 1;
      while (row[end] === row[start]) end++;
      if (row[start] !== ".") found.push({ x: start, y, width: end - start, letter: row[start]! });
      start = end;
    }
    return found;
  });
}

const fill = (letter: string) => (letter === "#" ? "currentColor" : PALETTE[letter]);

// An icon at the size of the text around it. With a `label` it is read out; without, it is
// only decoration and is hidden from screen readers.
export function Icon({ name, label, className = "" }: { name: IconName; label?: string; className?: string }) {
  const rows = ICONS[name];
  const width = rows[0]!.length;
  const height = rows.length;
  return (
    <svg
      className={`icon icon-${name} ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: `${width / height}em`, height: "1em" }}
      shapeRendering="crispEdges"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {runs(rows).map((run) => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} fill={fill(run.letter)} />
      ))}
    </svg>
  );
}

// A one-colour icon as a CSS image, for the marks the stylesheet draws before list items and
// headings. The stylesheet uses it as a mask over the text colour, so `#` is all it draws.
// `tests/webIcons.test.ts` checks the stylesheet still carries these exact images.
export function glyphUri(name: IconName): string {
  const rows = ICONS[name];
  const path = runs(rows)
    .map((run) => `M${run.x} ${run.y}h${run.width}v1h-${run.width}z`)
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows[0]!.length} ${rows.length}' shape-rendering='crispEdges'><path d='${path}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}")`;
}

// The evening's time is written in a sentence with `TIME_MARK` ("This takes 2" and the mark).
// Rule text keeps the plain mark, so it can be tested and sent by the server as words; this
// draws each one as the hourglass icon instead.
const HOURGLASS = TIME_MARK;
const COUNTED = new RegExp(`(\\d+) ${TIME_MARK}`, "gu");

export function Said({ text }: { text: string }) {
  const parts = text.split(HOURGLASS);
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 && <Icon name="hourglass" label="hourglass" />}
    </Fragment>
  ));
}

// The same sentence for a reader that can't see the icon, such as an aria-label or a title.
export function spoken(text: string): string {
  return text
    .replace(COUNTED, (_, amount: string) => `${amount} ${amount === "1" ? "hourglass" : "hourglasses"}`)
    .replaceAll(HOURGLASS, "hourglasses");
}
