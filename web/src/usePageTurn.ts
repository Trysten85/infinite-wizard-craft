import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

// The book shows a left-hand page, with its spine on the right. Going "forward" lays the next
// page down from the spine. Going "back" lifts the current page away toward the spine.
export type TurnDirection = "forward" | "back";

const TURN_MS = 750;
// The turning page is cut into this many vertical strips, each angled a little more than the
// one before, so together they read as a bend. Each strip is a copy of the page, so more costs more.
const STRIPS = 8;
// How many points along the turn each strip's place is worked out at.
const STEPS = 24;
// How many degrees further round the free edge is than the spine edge, at the middle of the turn.
const CURL = 66;
// How dark the paper gets when it has turned fully away, and how dark the page beneath gets.
const STRIP_SHADE = 0.45;
const PAGE_SHADE = 0.38;
// Neighbouring strips overlap by this many pixels, so no hairline shows between them. It has to
// be several, because a steeply angled strip is seen nearly edge-on and its overlap shrinks.
const OVERLAP = 6;
// The turn only fits the side-by-side layout, where the page doesn't scroll as a whole.
const TOO_NARROW = "(max-width: 720px)";

// Where each strip is at each step of a page lifting off: flat at the start, edge-on at the end.
// `across` and `toward` are how far the strip's spine-side edge has moved toward the spine and
// toward the reader, in strip widths. The spine edge starts slowly while the curl builds, so the
// free edge peels up first and the page then rolls toward the spine.
// `flat` and `graded` are the strengths of the strip's two shades (see `buildLeaf`).
type Step = { across: number; toward: number; angle: number; flat: number; graded: number };
const LIFT = Array.from({ length: STRIPS }, () => [] as Step[]);
// The paper gets darker the further it has turned away from the reader.
const darkness = (angle: number) => STRIP_SHADE * Math.sin((Math.min(angle, 90) * Math.PI) / 180);
for (let step = 0; step <= STEPS; step++) {
  const progress = step / STEPS;
  const swing = 90 * progress * progress;
  const curl = CURL * Math.sin(Math.PI * progress);
  // Walk out from the spine along the bent page. `out` is the distance from the spine.
  let out = 0;
  let toward = 0;
  for (let strip = 0; strip < STRIPS; strip++) {
    // Never past upright, so the back of the paper never has to be drawn.
    const angle = Math.min(swing + (curl * (strip + 1)) / STRIPS, 90);
    // The page's true angle changes smoothly, so the darkness should too. It runs from what the
    // bend has reached at this strip's spine-side edge to what it reaches at its free edge.
    const near = darkness(swing + (curl * strip) / STRIPS);
    const far = darkness(angle);
    LIFT[strip]!.push({ across: strip - out, toward, angle, flat: near, graded: (far - near) / (1 - near) });
    out += Math.cos((angle * Math.PI) / 180);
    toward += Math.sin((angle * Math.PI) / 180);
  }
}

// A detached copy of the page as it looks right now. It can be cloned again without losing
// what was typed or picked; `restoreScroll` puts scroll positions back once a clone is placed.
function copyPage(live: HTMLElement): HTMLElement {
  const copy = live.cloneNode(true) as HTMLElement;
  copy.classList.add("copy");

  const liveParts = live.querySelectorAll<HTMLElement>("*");
  const unseen: HTMLElement[] = [];
  copy.querySelectorAll<HTMLElement>("*").forEach((part, index) => {
    const from = liveParts[index]!;
    if (from instanceof HTMLInputElement) part.setAttribute("value", from.value);
    if (from instanceof HTMLOptionElement) part.toggleAttribute("selected", from.selected);
    if (from.scrollTop > 0) part.dataset.scrollTop = String(from.scrollTop);
    // Anything scrolled out of sight below its list can't show, and a long list is slow to copy.
    const list = from.parentElement!;
    const below = list.scrollHeight > list.clientHeight && from.getBoundingClientRect().top >= list.getBoundingClientRect().bottom;
    if (below) unseen.push(part);
  });
  unseen.forEach((part) => part.remove());
  return copy;
}

function restoreScroll(placed: HTMLElement) {
  placed.querySelectorAll<HTMLElement>("[data-scroll-top]").forEach((part) => {
    part.scrollTop = Number(part.dataset.scrollTop);
  });
}

function element(className: string): HTMLDivElement {
  const made = document.createElement("div");
  made.className = className;
  return made;
}

// Builds the bending page: a row of strips, each showing its own slice of the copied page, and
// each followed by two shades that move with it. They are plain siblings drawn in order from the
// spine outward, which is also back to front, so the browser never has to sort them by depth.
// The shades are their own layers so that darkening a strip never means redrawing its text.
// One shade is even and one fades in toward the free edge. Together they darken the strip in a
// straight ramp that meets the next strip's, so no line shows where two strips join.
function buildLeaf(copy: HTMLElement, width: number) {
  const leaf = element("page-leaf");
  leaf.style.setProperty("--overlap", `${OVERLAP}px`);
  const stripWidth = Math.ceil(width / STRIPS);
  const strips = Array.from({ length: STRIPS }, (_, index) => {
    const fromSpine = stripWidth * index - OVERLAP;
    const box = { right: `${fromSpine}px`, width: `${Math.min(stripWidth, width - stripWidth * index) + OVERLAP}px` };
    const strip = element("leaf-strip");
    const flat = element("leaf-shade");
    const graded = element("leaf-shade graded");
    for (const layer of [strip, flat, graded]) Object.assign(layer.style, box);
    const slice = (index === 0 ? copy : copy.cloneNode(true)) as HTMLElement;
    slice.style.width = `${width}px`;
    slice.style.right = `${-fromSpine}px`;
    strip.append(slice);
    leaf.append(strip, flat, graded);

    const steps = LIFT[index]!.map((step) => ({
      ...step,
      transform: `translate3d(${(step.across * stripWidth).toFixed(1)}px, 0, ${(step.toward * stripWidth).toFixed(1)}px) rotateY(${step.angle.toFixed(2)}deg)`,
    }));
    return {
      strip: { layer: strip, frames: steps.map(({ transform }) => ({ transform })) },
      flat: { layer: flat, frames: steps.map(({ transform, flat }) => ({ transform, opacity: flat.toFixed(3) })) },
      graded: { layer: graded, frames: steps.map(({ transform, graded }) => ({ transform, opacity: graded.toFixed(3) })) },
    };
  });
  return { leaf, strips };
}

// Turns the book's page whenever its content is swapped. Attach `page` to the page element.
export function usePageTurn() {
  const page = useRef<HTMLDivElement>(null);
  const finishTurn = useRef<(() => void) | null>(null);

  useEffect(() => () => finishTurn.current?.(), []);

  // Runs `change`, a state update that redraws the page, behind a page-turn.
  function turn(direction: TurnDirection, change: () => void) {
    finishTurn.current?.();
    const live = page.current;
    const still =
      !live || !live.animate || matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia(TOO_NARROW).matches;
    if (still) return change();

    const holder = live.parentElement!;
    const old = copyPage(live);
    flushSync(change);

    // A page landing carries the new content, and the old page waits underneath it.
    // A page lifting carries the old content, and the new page is already underneath.
    const landing = direction === "forward";
    const props: HTMLElement[] = [];
    if (landing) {
      const waiting = old.cloneNode(true) as HTMLElement;
      waiting.classList.add("under");
      props.push(waiting);
    }
    // The turning page throws the one beneath it into shadow.
    const shadow = element("page-shadow");
    const { leaf, strips } = buildLeaf(landing ? copyPage(live) : old, live.offsetWidth);
    props.push(shadow, leaf);
    for (const prop of props) {
      prop.inert = true;
      prop.setAttribute("aria-hidden", "true");
      holder.append(prop);
      restoreScroll(prop);
    }

    // A landing is a lift played backwards.
    const timing: KeyframeAnimationOptions = { duration: TURN_MS, fill: "both", direction: landing ? "reverse" : "normal" };
    const animations = strips
      .flatMap((parts) => [parts.strip, parts.flat, parts.graded])
      .map(({ layer, frames }) => layer.animate(frames, timing));
    animations.push(shadow.animate([{ opacity: PAGE_SHADE }, { opacity: 0 }], timing));

    const finish = () => {
      animations.forEach((animation) => animation.cancel());
      props.forEach((prop) => prop.remove());
      finishTurn.current = null;
    };
    animations[0]!.onfinish = finish;
    finishTurn.current = finish;
  }

  return { page, turn };
}
