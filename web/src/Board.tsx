import type { PointerEvent, ReactNode, RefObject } from "react";
import type { GameEntry } from "../../src/shared/schema";
import type { Bubble } from "./bubbles";
import { EntryBubble } from "./EntryBubble";

// A one-shot animation on a board bubble.
export type BubbleEffect = "pop" | "new" | "shake";

// The animation whose end means the effect is over.
const EFFECT_END: Record<BubbleEffect, string> = { pop: "bubble-pop", new: "label-fade", shake: "bubble-shake" };

type Props = {
  boardRef: RefObject<HTMLElement | null>;
  bubbleEls: RefObject<Map<string, HTMLElement>>;
  bubbles: Bubble[];
  byId: Map<string, GameEntry>;
  merging: ReadonlySet<string>;
  effects: Record<string, BubbleEffect>;
  liftedId: string | null;
  targetId: string | null;
  selectedId: string | null;
  onGrab: (event: PointerEvent<HTMLElement>, bubble: Bubble) => void;
  onSelect: (entryId: string) => void;
  onDuplicate: (bubble: Bubble) => void;
  onRemove: (bubbleId: string) => void;
  onEffectEnd: (bubbleId: string) => void;
  // The boxes and buttons that sit on the board. Bubbles are drawn over them.
  children: ReactNode;
};

export function Board(props: Props) {
  const { bubbles, byId, merging, effects, bubbleEls } = props;

  return (
    <section className="board" ref={props.boardRef} aria-label="Board">
      {bubbles.length === 0 && <p className="board-hint">Drag things here, then drop one on another.</p>}
      {props.children}

      {bubbles.map((bubble) => {
        const entry = byId.get(bubble.entryId);
        if (!entry) return null;
        const effect = effects[bubble.id];
        const busy = merging.has(bubble.id);
        const targeted = bubble.id === props.targetId;
        const state = [
          busy && "merging",
          effect,
          bubble.id === props.liftedId && "lifted",
          targeted && "target",
          entry.id === props.selectedId && "selected",
        ];
        return (
          <EntryBubble
            key={bubble.id}
            entry={entry}
            className={state.filter(Boolean).join(" ")}
            style={{ left: bubble.x, top: bubble.y }}
            aria-busy={busy}
            ref={(element) => {
              if (element) bubbleEls.current.set(bubble.id, element);
              else bubbleEls.current.delete(bubble.id);
            }}
            onPointerDown={(event) => !busy && props.onGrab(event, bubble)}
            onClick={() => props.onSelect(entry.id)}
            onDoubleClick={() => !busy && props.onDuplicate(bubble)}
            onContextMenu={(event) => {
              event.preventDefault();
              if (!busy) props.onRemove(bubble.id);
            }}
            onAnimationEnd={(event) => {
              if (effect && event.animationName === EFFECT_END[effect]) props.onEffectEnd(bubble.id);
            }}
          >
            {effect === "new" && <span className="bubble-label fresh-label">New discovery</span>}
          </EntryBubble>
        );
      })}
    </section>
  );
}
