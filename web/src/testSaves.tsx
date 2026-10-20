import { useState } from "react";
import saves from "../../data/test-saves.json";
import { resetTestSave } from "./api";

// The test saves `npm run saves` builds, one player each, for swapping between while testing. Read
// from the data file itself, so a scenario added there shows up here with no change to the page.
export const TEST_SAVES: { player: string; about: string }[] = saves.scenarios.map(({ player, about }) => ({ player, about }));

// Shown by the dev server only (see `App.tsx`). Picking a save makes it the player; "Start over"
// rebuilds the open one in place through the server, then `onRestarted` reloads it.
export function TestSaves({ current, onPick, onRestarted }: { current: string; onPick: (player: string) => void; onRestarted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = TEST_SAVES.find((save) => save.player === current);

  async function startOver(player: string) {
    setBusy(true);
    setError("");
    try {
      await resetTestSave(player);
      onRestarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="test-saves">
      <summary>Test saves</summary>
      <p>
        Built by <code>npm run saves</code>. A save that has not been built opens as a new player.
      </p>
      <div className="test-save-list">
        {TEST_SAVES.map(({ player, about }) => (
          <button key={player} title={about} aria-pressed={player === current} onClick={() => onPick(player)}>
            {player}
          </button>
        ))}
      </div>
      {open && (
        <p>
          <button className="link" disabled={busy} title={open.about} onClick={() => startOver(open.player)}>
            {busy ? "starting over…" : `Start ${open.player} over`}
          </button>
        </p>
      )}
      {error && <p className="test-save-error" role="alert">{error}</p>}
    </details>
  );
}
