import { Blocks, type Block } from "./pixels";
import type { PlotState } from "./town";

// One plot of the street, as pixel art seen side-on. Each plot is a 40 by 48 grid of square
// pixels with the road along its bottom six rows, so plots set side by side make one street.
// Buildings are drawn from blocks, in the manner of the shopkeeper's stall.

export const PLOT_WIDTH = 40;
export const PLOT_HEIGHT = 48;
const GROUND = 42;

const ROAD: Block[] = [
  [0, GROUND, PLOT_WIDTH, 1, "#7d776a"],
  [0, GROUND + 1, PLOT_WIDTH, 5, "#4d4a41"],
  ...[3, 14, 22, 33].map((x, index): Block => [x, GROUND + 2 + (index % 2) * 2, 4, 1, "#5d594e"]),
];

const GRASS: Block[] = [
  [0, 38, PLOT_WIDTH, 4, "#3f6b3a"],
  [0, 38, PLOT_WIDTH, 1, "#55883f"],
  ...[4, 11, 19, 27, 34].map((x, index): Block => [x, 37 - (index % 2), 1, 2 + (index % 2), "#55883f"]),
];

// A roof that steps in two pixels a side for every row it climbs, from its eaves at `y`.
function gable(x: number, y: number, width: number, color: string, edge: string): Block[] {
  const rows: Block[] = [];
  for (let step = 0; width - step * 4 > 0; step++) rows.push([x + step * 2, y - step, width - step * 4, 1, step === 0 ? edge : color]);
  return rows;
}

// Every building, by id. `glass` is the colour of its windows: lit from dusk, dark by day.
const BUILDINGS: Record<string, (glass: string, lit: boolean) => Block[]> = {
  farm: (glass) => [
    [6, 24, 28, 18, "r"],
    [6, 24, 28, 1, "R"],
    [33, 24, 1, 18, "R"],
    ...gable(4, 23, 32, "B", "k"),
    [18, 18, 4, 4, glass],
    [16, 30, 8, 12, "R"],
    [16, 30, 8, 1, "c"],
    [16, 30, 1, 12, "c"],
    [23, 30, 1, 12, "c"],
    [16, 36, 8, 1, "c"],
    // Hay by the door.
    [0, 37, 5, 5, "y"],
    [0, 37, 5, 1, "Y"],
    [0, 39, 5, 1, "Y"],
  ],
  "market-stall": (_glass, lit) => [
    [6, 20, 2, 22, "b"],
    [32, 20, 2, 22, "b"],
    [8, 21, 24, 11, "#33200f"],
    ...Array.from({ length: 6 }, (_, stripe): Block[] => {
      const [main, dark] = stripe % 2 === 0 ? ["r", "R"] : ["c", "C"];
      return [
        [5 + stripe * 5, 13, 5, 7, main!],
        [5 + stripe * 5, 13, 5, 1, dark!],
        [6 + stripe * 5, 20, 3, 1, main!],
      ];
    }).flat(),
    [19, 21, 2, 3, lit ? "y" : "Y"],
    [5, 32, 30, 2, "L"],
    [5, 34, 30, 1, "B"],
    [6, 35, 28, 7, "b"],
    [15, 35, 1, 7, "B"],
    [24, 35, 1, 7, "B"],
    // Goods on the counter.
    [9, 29, 3, 3, "d"],
    [14, 28, 3, 4, "e"],
    [22, 29, 4, 3, "m"],
    [28, 28, 2, 4, "y"],
  ],
  tavern: (glass) => [
    [5, 22, 30, 20, "c"],
    [5, 22, 30, 1, "B"],
    [5, 31, 30, 1, "B"],
    [5, 22, 1, 20, "B"],
    [34, 22, 1, 20, "B"],
    [14, 22, 1, 9, "B"],
    [25, 22, 1, 9, "B"],
    [27, 9, 3, 8, "g"],
    ...gable(3, 21, 34, "b", "k"),
    [8, 25, 4, 4, glass],
    [18, 25, 4, 4, glass],
    [28, 25, 4, 4, glass],
    [8, 34, 5, 4, glass],
    [27, 34, 5, 4, glass],
    [17, 33, 6, 9, "B"],
    [21, 37, 1, 1, "y"],
    // The sign, hung out over the street.
    [35, 24, 4, 1, "k"],
    [36, 25, 3, 4, "y"],
    [37, 26, 1, 2, "Y"],
  ],
  smithy: (_glass, lit) => [
    [26, 8, 5, 16, "W"],
    [26, 8, 5, 1, "g"],
    [5, 24, 30, 18, "g"],
    [5, 24, 30, 1, "k"],
    ...[
      [8, 27],
      [22, 26],
      [29, 31],
      [24, 36],
      [7, 39],
    ].map(([x, y]): Block => [x!, y!, 3, 1, "W"]),
    ...gable(3, 23, 34, "#3a3a40", "k"),
    // The open front, and the fire inside it.
    [9, 29, 12, 13, "k"],
    [12, 35, 6, 7, lit ? "o" : "R"],
    [13, 37, 4, 5, lit ? "y" : "r"],
    // An anvil out front.
    [25, 37, 7, 2, "k"],
    [27, 39, 3, 3, "k"],
  ],
  "herb-garden": (glass) => [
    [22, 28, 14, 14, "L"],
    [22, 28, 14, 1, "b"],
    ...gable(20, 27, 18, "d", "D"),
    [27, 34, 4, 8, "b"],
    [32, 31, 3, 3, glass],
    [1, 38, 20, 4, "#6b4a2a"],
    [1, 37, 20, 1, "c"],
    ...Array.from({ length: 6 }, (_, row): Block[] => [
      [3 + row * 3, 34, 1, 4, "D"],
      [2 + row * 3, 33, 3, 2, row % 3 === 1 ? "m" : row % 3 === 2 ? "y" : "d"],
    ]).flat(),
  ],
  "wizards-tower": (glass) => [
    [26, 32, 9, 10, "#7d7890"],
    [25, 30, 11, 2, "P"],
    [29, 35, 3, 3, glass],
    [14, 14, 12, 28, "#7d7890"],
    [24, 14, 2, 28, "#5e5a70"],
    [14, 24, 12, 1, "#5e5a70"],
    ...Array.from({ length: 8 }, (_, step): Block => [12 + step, 13 - step, 16 - step * 2, 1, step === 0 ? "P" : "p"]),
    [19, 3, 2, 3, "y"],
    [18, 4, 4, 1, "y"],
    [18, 17, 3, 4, glass],
    [18, 27, 3, 4, glass],
    [18, 35, 4, 7, "B"],
  ],
};

// A building the page has no drawing for yet: a plain house.
const HOUSE = (glass: string): Block[] => [
  [7, 24, 26, 18, "C"],
  [7, 24, 26, 1, "B"],
  ...gable(5, 23, 30, "r", "R"),
  [11, 28, 5, 5, glass],
  [24, 28, 5, 5, glass],
  [17, 33, 6, 9, "B"],
];

const LOTS: Record<Exclude<PlotState, "building">, Block[]> = {
  later: GRASS,
  // Fenced off until a deed covers it.
  locked: [
    ...GRASS,
    ...Array.from({ length: 6 }, (_, post): Block => [2 + post * 7, 31, 2, 9, "b"]),
    [0, 33, PLOT_WIDTH, 1, "l"],
    [0, 37, PLOT_WIDTH, 1, "l"],
  ],
  "for-sale": [
    ...GRASS,
    [19, 28, 2, 12, "b"],
    [10, 17, 20, 11, "k"],
    [11, 18, 18, 9, "c"],
    [17, 20, 6, 5, "Y"],
    [18, 20, 4, 5, "y"],
    [17, 21, 6, 3, "y"],
  ],
  // Staked out and waiting for a plan.
  empty: [
    [0, 38, PLOT_WIDTH, 4, "#7a5a3a"],
    [0, 38, PLOT_WIDTH, 1, "#8f6c47"],
    [3, 32, 1, 7, "L"],
    [36, 32, 1, 7, "L"],
    [3, 33, 34, 1, "c"],
    [13, 36, 13, 2, "l"],
    [15, 34, 10, 2, "b"],
    [15, 34, 10, 1, "L"],
  ],
};

type Props = {
  state: PlotState;
  // The id of the building standing here, when there is one.
  building?: string;
  // Windows and fires are lit from dusk.
  lit: boolean;
};

export function PlotArt({ state, building, lit }: Props) {
  const glass = lit ? "y" : "#27324a";
  const blocks = state === "building" ? (BUILDINGS[building ?? ""] ?? HOUSE)(glass, lit) : LOTS[state];
  return (
    <svg className="plot-art" viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`} shapeRendering="crispEdges" aria-hidden="true">
      <Blocks of={[...ROAD, ...blocks]} />
    </svg>
  );
}
