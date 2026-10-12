import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { pickDropTarget, type Rect, type Size } from "./bubbles";

// Pointer travel below this many pixels is a click, not a drag.
const DRAG_THRESHOLD = 4;

// What is being dragged. `bubbleId` is null when it comes from the list rather than the board.
export type DragSource = { entryId: string; bubbleId: string | null };

// Where a drag ended. `left` and `top` are the dragged bubble's corner in viewport pixels.
// `zone` names the special place it was let go over, if any. A drop in a zone has no target.
export type Drop<Zone extends string> = DragSource & { left: number; top: number; size: Size; targetId: string | null; zone: Zone | null };

type Options<Zone extends string> = {
  // Board bubbles that can be merged into, in stacking order.
  targets: (exceptId: string | null) => { id: string; rect: Rect }[];
  // The special place under the pointer that would take what is being dragged, if there is one.
  zoneAt: (clientX: number, clientY: number, dragged: DragSource) => Zone | null;
  onDrop: (drop: Drop<Zone>) => void;
};

export function useBubbleDrag<Zone extends string>(options: Options<Zone>) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const [source, setSource] = useState<DragSource | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const ghost = useRef<HTMLElement | null>(null);
  const corner = useRef({ left: 0, top: 0 });
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => () => cancel.current?.(), []);

  // The ghost follows the pointer by direct style writes, so moving it never re-renders.
  function placeGhost() {
    if (ghost.current) ghost.current.style.transform = `translate(${corner.current.left}px, ${corner.current.top}px)`;
  }

  function ghostRef(element: HTMLElement | null) {
    ghost.current = element;
    placeGhost();
  }

  function start(event: ReactPointerEvent<HTMLElement>, from: DragSource) {
    if (event.button !== 0) return;
    cancel.current?.();

    const rect = event.currentTarget.getBoundingClientRect();
    const grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const size = { width: rect.width, height: rect.height };
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;
    let hovered: string | null = null;
    let hoveredZone: Zone | null = null;

    function track(e: PointerEvent) {
      corner.current = { left: e.clientX - grab.x, top: e.clientY - grab.y };
      const { left, top } = corner.current;
      const zone = latest.current.zoneAt(e.clientX, e.clientY, from);
      const dragged = { left, top, right: left + size.width, bottom: top + size.height };
      const target = zone ? null : pickDropTarget(dragged, latest.current.targets(from.bubbleId));
      return { left, top, zone, targetId: target };
    }

    function onMove(e: PointerEvent) {
      if (!dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < DRAG_THRESHOLD) return;
        dragging = true;
        document.body.classList.add("dragging");
        setSource(from);
      }
      const { targetId: next, zone: nextZone } = track(e);
      placeGhost();
      if (next !== hovered) {
        hovered = next;
        setTargetId(next);
      }
      if (nextZone !== hoveredZone) {
        hoveredZone = nextZone;
        setZone(nextZone);
      }
    }

    function finish() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("dragging");
      cancel.current = null;
      setSource(null);
      setTargetId(null);
      setZone(null);
    }

    function onUp(e: PointerEvent) {
      finish();
      if (!dragging) return;
      swallowNextClick();
      latest.current.onDrop({ ...from, size, ...track(e) });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", finish);
    cancel.current = finish;
  }

  return { source, targetId, zone, ghostRef, start };
}

// Releasing a drag over the bubble it started on would otherwise also count as a click.
function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}
