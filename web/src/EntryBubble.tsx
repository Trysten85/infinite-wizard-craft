import type { ComponentProps } from "react";
import type { GameEntry } from "../../src/shared/schema";

// The pill shown for an entry in the list, on the board, and under the pointer while dragging.
export function EntryBubble({ entry, className = "", children, ...rest }: { entry: GameEntry } & ComponentProps<"button">) {
  return (
    <button type="button" className={`bubble ${entry.kind} ${className}`} {...rest}>
      {entry.affinity.length > 0 && (
        <span className="dots" aria-hidden="true">
          {entry.affinity.map((id) => (
            <ElementDot key={id} id={id} />
          ))}
        </span>
      )}
      {entry.name}
      {children}
    </button>
  );
}

export function ElementDot({ id }: { id: string }) {
  return <span className="dot" style={{ background: `var(--el-${id}, var(--dim))` }} />;
}
