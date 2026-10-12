// Pixel art drawn in code. Big flat areas are blocks, and anything with detail is a sprite: rows
// of letters, one letter per pixel, looked up in this palette.

export const PALETTE: Record<string, string> = {
  k: "#2a1a12", // outline
  w: "#f6f1e4", // white
  W: "#cfc6b6",
  g: "#8f877b",
  r: "#a63b2b", // red
  R: "#6f2219",
  c: "#ecdcb4", // cream
  C: "#c9b282",
  b: "#8a5f38", // wood
  B: "#5a3a20",
  l: "#b3854f",
  L: "#cfa46a",
  s: "#e0b07e", // skin
  S: "#bf8959",
  h: "#5a3518", // hair
  H: "#80502a",
  v: "#55784a", // waistcoat
  V: "#38532f",
  p: "#7b4bb0", // purple
  P: "#4f2d7a",
  q: "#b991e6",
  t: "#3aa69c", // teal
  T: "#22706a",
  u: "#96e6d8",
  m: "#d3589a", // pink
  M: "#8f2f66",
  n: "#f4a9d2",
  y: "#ecc24f", // gold
  Y: "#a67a1c",
  o: "#f28c2a", // flame
  e: "#3f74c9", // blue
  E: "#274a86",
  f: "#a9cdf5",
  d: "#3f9a4c", // green potion
  D: "#27682f",
  x: "#e6e1d3", // smoke
};

export type Block = [x: number, y: number, width: number, height: number, color: string];

export function Blocks({ of }: { of: Block[] }) {
  return of.map(([x, y, width, height, color]) => (
    <rect key={`${x}-${y}-${width}-${height}`} x={x} y={y} width={width} height={height} fill={PALETTE[color] ?? color} />
  ));
}

// Draws rows of palette letters with (x, y) as the top-left pixel. A dot is a clear pixel.
// `recolor` swaps letters, so one shape can be drawn in several colours.
export function Sprite(props: { x: number; y: number; rows: string[]; recolor?: Record<string, string>; className?: string }) {
  const { x, y, rows, recolor = {}, className } = props;
  const runs = rows.flatMap((row, dy) => {
    const found = [];
    for (let start = 0; start < row.length; ) {
      let end = start + 1;
      while (row[end] === row[start]) end++;
      const letter = recolor[row[start]!] ?? row[start]!;
      if (letter !== ".") {
        found.push(<rect key={`${dy}-${start}`} x={x + start} y={y + dy} width={end - start} height={1} fill={PALETTE[letter]} />);
      }
      start = end;
    }
    return found;
  });
  return <g className={className}>{runs}</g>;
}
