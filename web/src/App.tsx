import { useState, type FormEvent } from "react";
import { TestSaves } from "./testSaves";
import { Workbench } from "./Workbench";

const PLAYER_KEY = "iwc-player";

export function App() {
  const [player, setPlayer] = useState(() => localStorage.getItem(PLAYER_KEY) ?? "");
  // Counts the times the open save was started over, so the workbench loads it afresh each time.
  const [restarts, setRestarts] = useState(0);

  function choose(name: string) {
    localStorage.setItem(PLAYER_KEY, name);
    setPlayer(name);
  }

  return (
    <>
      {player ? (
        // Keyed by the player, so switching or starting over loads the save from scratch.
        <Workbench
          key={`${player}-${restarts}`}
          player={player}
          onLeave={() => {
            localStorage.removeItem(PLAYER_KEY);
            setPlayer("");
          }}
        />
      ) : (
        <NameForm onSubmit={choose} />
      )}
      {import.meta.env.DEV && <TestSaves current={player} onPick={choose} onRestarted={() => setRestarts((count) => count + 1)} />}
    </>
  );
}

function NameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name) onSubmit(name);
  }

  return (
    <main className="page narrow">
      <h1>Infinite Wizard Craft</h1>
      <form className="name-form" onSubmit={handleSubmit}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
        />
        <button type="submit" disabled={!name}>
          Open the workbench
        </button>
      </form>
    </main>
  );
}
