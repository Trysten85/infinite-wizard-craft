import { Blocks, PALETTE, Sprite, type Block } from "./pixels";

// The shopkeeper behind his market-stall counter, as pixel art seen from the customer's side.
// The scene is a 96 by 72 grid of square pixels. Big flat areas are blocks, and anything with
// detail is a sprite: rows of letters, one letter per pixel, looked up in the shared palette.

const WIDTH = 96;
const HEIGHT = 72;

const STRIPE = 12;

// The stall itself: back wall, shelves, posts, the striped awning, and the counter.
const STALL: Block[] = [
  [0, 0, WIDTH, HEIGHT, "#3f2a1c"],
  // Back wall planks, and the shadow the awning throws on them.
  ...Array.from({ length: 7 }, (_, plank): Block => [12 + plank * 12, 12, 1, 34, "#33200f"]),
  [0, 10, WIDTH, 3, "#2c1b10"],
  // Two shelves.
  [6, 22, 84, 2, "l"],
  [6, 24, 84, 1, "#2c1b10"],
  [6, 34, 84, 2, "l"],
  [6, 36, 84, 1, "#2c1b10"],
  // Posts.
  [0, 8, 4, 40, "b"],
  [0, 8, 1, 40, "l"],
  [92, 8, 4, 40, "b"],
  [95, 8, 1, 40, "B"],
  // Awning: stripes with a scalloped lower edge.
  ...Array.from({ length: WIDTH / STRIPE }, (_, stripe): Block[] => {
    const x = stripe * STRIPE;
    const [main, dark] = stripe % 2 === 0 ? ["r", "R"] : ["c", "C"];
    return [
      [x, 0, STRIPE, 9, main!],
      [x + STRIPE - 1, 0, 1, 9, dark!],
      [x, 0, STRIPE, 1, dark!],
      [x + 1, 9, STRIPE - 2, 1, main!],
      [x + 3, 10, STRIPE - 6, 1, dark!],
    ];
  }).flat(),
  // Counter: the top you look down on, its front lip, and the plank front.
  [0, 46, WIDTH, 6, "L"],
  [0, 46, WIDTH, 1, "l"],
  [0, 52, WIDTH, 2, "l"],
  [0, 54, WIDTH, 1, "B"],
  [0, 55, WIDTH, 17, "b"],
  ...[16, 80].map((x): Block => [x, 55, 1, 17, "B"]),
  [0, 70, WIDTH, 2, "B"],
  // A cloth runner over the middle of the counter, hanging to a point with a gold tassel.
  [34, 46, 28, 15, "p"],
  [34, 46, 1, 15, "y"],
  [61, 46, 1, 15, "y"],
  [35, 52, 26, 1, "P"],
  [34, 60, 28, 1, "y"],
  [37, 61, 22, 1, "p"],
  [40, 62, 16, 1, "p"],
  [43, 63, 10, 1, "P"],
  [46, 64, 4, 1, "y"],
  [47, 65, 2, 2, "y"],
  [47, 55, 2, 1, "y"],
  [46, 56, 4, 1, "y"],
  [47, 57, 2, 1, "y"],
];

// What sits on the back shelves, besides the bottles drawn as sprites.
const SHELF_GOODS: Block[] = [
  // Books on the top shelf.
  [68, 16, 3, 6, "P"],
  [69, 17, 1, 1, "y"],
  [71, 15, 2, 7, "r"],
  [73, 17, 3, 5, "e"],
  [74, 18, 1, 1, "y"],
  [76, 16, 2, 6, "V"],
  // A candle on the lower shelf.
  [19, 30, 2, 4, "c"],
  [19, 28, 2, 1, "o"],
  [19, 29, 2, 1, "y"],
  // Rolled scrolls.
  [74, 31, 9, 3, "c"],
  [74, 31, 1, 3, "C"],
  [82, 31, 1, 3, "C"],
  [76, 28, 6, 3, "c"],
  [76, 28, 1, 3, "C"],
  [81, 28, 1, 3, "C"],
];

// The sign and the lantern hanging from the awning.
const HANGING: Block[] = [
  [11, 10, 1, 3, "g"],
  [23, 10, 1, 3, "g"],
  [7, 13, 21, 9, "B"],
  [8, 14, 19, 7, "c"],
  [85, 10, 1, 3, "g"],
  [83, 13, 5, 1, "Y"],
  [82, 14, 7, 6, "Y"],
  [83, 15, 5, 4, "y"],
  [84, 15, 3, 4, "o"],
  [85, 16, 1, 2, "w"],
  [83, 20, 5, 1, "Y"],
];

// Letters three pixels wide, for the sign.
const OPEN = [
  "kkk.kkk.kkk.kk.",
  "k.k.k.k.k...k.k",
  "k.k.kkk.kk..k.k",
  "k.k.k...k...k.k",
  "kkk.k...kkk.k.k",
];

const KEEPER = [
  "......hhhhhhhh......",
  "....hhhHhhhhHhhh....",
  "...hhHhhhhhhhhHhh...",
  "..hhhhhhhhhhhhhhhh..",
  "..hhhhsssssssshhhh..",
  "..hhhsssssssssshhh..",
  ".sshsssssssssssshss.",
  "sSshsskksssskksshsSs",
  "sSshsskwsssskwsshsSs",
  ".sshsssssSSssssshss.",
  "...hssnssssssnssh...",
  "....ssssRRRRssss....",
  ".....ssssssssss.....",
  "......cssssssc......",
  "..cccvvvccccvvvccc..",
  ".cccvvvvvccvvvvvccc.",
  "ccccvvvvvyyvvvvvcccc",
  "cccCvvvvvvvvvvvvCccc",
  "cccCvvvvvyyvvvvvCccc",
  "cccCvvvvvvvvvvvvCccc",
  "sssCVvvvvvvvvvvVCccc",
];

// Laid over his eyes for a moment, every few seconds.
const BLINK = ["ss....ss", "kk....kk"];

// The long pipe, running from the corner of his mouth down across his sleeve, and the hand under it.
const PIPE: Block[] = [
  [50, 36, 1, 1, "k"],
  [51, 37, 2, 1, "k"],
  [53, 38, 2, 1, "k"],
  [55, 39, 2, 1, "k"],
  [57, 40, 2, 1, "k"],
  [55, 40, 3, 3, "s"],
  [55, 42, 3, 1, "S"],
];
const PIPE_BOWL = [".oyo.", "klllk", "klbbk", "klbbk", ".kkk."];

const CAT = [
  "..............w..w..",
  ".....wwwwww..wwwwww.",
  "...wwwwwwwwwwwwwwwww",
  "..wwwwwwwwwwwgwwgww.",
  ".wwwwwwwwwwrwwwnwww.",
  ".wwwwwwwwwwrwwwwww..",
  "wwWWwwwwwwwwwwww....",
  "wWWWWWWWWwwwww......",
  ".WWWWWWWW...........",
];
const CUSHION: Block[] = [
  [4, 43, 24, 3, "r"],
  [3, 44, 26, 2, "r"],
  [4, 46, 24, 1, "R"],
];
const SNORE = ["ww.", ".w.", ".ww"];

// Crystal shards in three sizes. The letters a, b and c are light, middle and dark.
const SHARD_TALL = ["...a...", "..aab..", "..abb..", ".aabbc.", ".aabbc.", ".abbcc.", "aabbccc", "aabbccc", ".abbcc."];
const SHARD = ["..a..", ".abb.", ".abc.", "aabcc", "aabcc", ".bcc."];
const SHARD_SMALL = [".ab.", "aabc", "abcc", ".bc."];
const PURPLE = { a: "q", b: "p", c: "P" };
const TEAL = { a: "u", b: "t", c: "T" };
const PINK = { a: "n", b: "m", c: "M" };

// A corked flask. The letters a and c are the liquid, light and dark.
const POTION = ["..bb..", "..ff..", ".faaf.", "faaaaf", "faaccf", "facccf", ".ffff."];
const CRYSTAL_BALL = ["..fff..", ".fwfff.", "fwfffee", "ffffeee", ".ffeee.", "..eee..", ".YyyyY.", "YYYYYYY"];
const SCROLL = ["cCcccccCc", "cCcrrccCc", "cCcccccCc"];
const COINS: Block[] = [
  [49, 50, 2, 1, "y"],
  [50, 49, 2, 1, "y"],
  [51, 50, 1, 1, "Y"],
  [53, 50, 3, 1, "y"],
  [54, 49, 1, 1, "Y"],
];

// One-pixel glints on the gems, each blinking on its own beat.
const GLINTS: [x: number, y: number][] = [
  [77, 41],
  [68, 45],
  [84, 44],
  [11, 27],
];

export function Shopkeeper() {
  return (
    <svg
      className="shopkeeper"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="A small shopkeeper smokes a long pipe behind his market-stall counter. A white cat sleeps on a cushion beside him, among gems, potions and a crystal ball."
    >
      <Blocks of={STALL} />
      <Blocks of={SHELF_GOODS} />
      <Sprite x={38} y={15} rows={POTION} recolor={{ a: "r", c: "R" }} />
      <Sprite x={9} y={26} rows={CRYSTAL_BALL} />
      <Sprite x={24} y={27} rows={POTION} recolor={{ a: "d", c: "D" }} />
      <Sprite x={66} y={27} rows={POTION} recolor={{ a: "t", c: "T" }} />
      <Sprite x={85} y={30} rows={SHARD_SMALL} recolor={PINK} />
      <Blocks of={HANGING} />
      <Sprite x={10} y={15} rows={OPEN} />

      <Sprite x={38} y={25} rows={KEEPER} />
      <Sprite x={44} y={32} rows={BLINK} className="blink" />
      <Blocks of={PIPE} />
      <Sprite x={58} y={37} rows={PIPE_BOWL} />
      <g className="pixel-smoke">
        <Sprite x={60} y={33} rows={["xx", "xx"]} className="puff" />
        <Sprite x={60} y={26} rows={[".x.", "xxx", ".x."]} className="puff" />
        <Sprite x={61} y={19} rows={[".xx.", "xxxx", ".xx."]} className="puff" />
      </g>

      <Blocks of={CUSHION} />
      <rect className="breath" x={11} y={37} width={5} height={1} fill={PALETTE.w} />
      <Sprite x={5} y={37} rows={CAT} />
      <Sprite x={26} y={38} rows={SNORE} className="snore" />
      <Sprite x={30} y={36} rows={SNORE} className="snore" />

      <Sprite x={31} y={43} rows={POTION} recolor={{ a: "e", c: "E" }} />
      <Sprite x={38} y={48} rows={SCROLL} />
      <Blocks of={COINS} />
      <Sprite x={66} y={44} rows={SHARD} recolor={TEAL} />
      <Sprite x={74} y={40} rows={SHARD_TALL} recolor={PURPLE} />
      <Sprite x={82} y={43} rows={SHARD} recolor={PINK} />
      <Sprite x={80} y={48} rows={SHARD_SMALL} recolor={TEAL} />
      <Sprite x={87} y={47} rows={SHARD_SMALL} recolor={PURPLE} />
      <g className="glints">
        {GLINTS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PALETTE.w} />
        ))}
      </g>
    </svg>
  );
}
