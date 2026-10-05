import { useEffect, useState, type FormEvent } from "react";
import type { CombineResult, GameEntry } from "../../src/shared/schema";
import { combine, fetchDiscovered } from "./api";

const PLAYER_KEY = "iwc-player";

export function App() {
  const [player, setPlayer] = useState(() => localStorage.getItem(PLAYER_KEY) ?? "");

  if (!player) {
    return (
      <NameForm
        onSubmit={(name) => {
          localStorage.setItem(PLAYER_KEY, name);
          setPlayer(name);
        }}
      />
    );
  }
  return (
    <Workbench
      player={player}
      onLeave={() => {
        localStorage.removeItem(PLAYER_KEY);
        setPlayer("");
      }}
    />
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

function Workbench({ player, onLeave }: { player: string; onLeave: () => void }) {
  const [entries, setEntries] = useState<GameEntry[]>([]);
  // Up to two picked entry ids. The same entry can be picked twice.
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<CombineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDiscovered(player)
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
  }, [player]);

  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  function pick(id: string) {
    setPicked((current) => (current.length < 2 ? [...current, id] : [id]));
  }

  async function handleCombine() {
    const [a, b] = picked;
    if (!a || !b) return;
    setBusy(true);
    setError("");
    try {
      const outcome = await combine(player, a, b);
      setResult(outcome);
      setPicked([]);
      if (outcome.firstDiscovery) setEntries((current) => [...current, outcome.entry]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <h1>Infinite Wizard Craft</h1>
        <p>
          {player} · {entries.length} discovered ·{" "}
          <button className="link" onClick={onLeave}>
            switch player
          </button>
        </p>
      </header>

      <section className="bench" aria-label="Combine">
        <Slot entry={byId.get(picked[0] ?? "")} />
        <span className="plus">+</span>
        <Slot entry={byId.get(picked[1] ?? "")} />
        <button onClick={handleCombine} disabled={picked.length < 2 || busy}>
          {busy ? "Combining…" : "Combine"}
        </button>
        <button className="link" onClick={() => setPicked([])} disabled={picked.length === 0 || busy}>
          clear
        </button>
      </section>

      {error && <p className="error">{error}</p>}
      {result && <ResultCard result={result} />}

      <section aria-label="Discovered">
        <h2>Discovered</h2>
        <ul className="tiles">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button className={`tile ${entry.kind}`} title={entry.description} onClick={() => pick(entry.id)}>
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Slot({ entry }: { entry: GameEntry | undefined }) {
  return <span className={`slot ${entry ? "filled" : ""}`}>{entry ? entry.name : "pick one"}</span>;
}

function ResultCard({ result }: { result: CombineResult }) {
  const { entry, firstDiscovery, origin } = result;
  return (
    <section className="result" aria-live="polite">
      <p className="result-label">{firstDiscovery ? "New discovery" : "Already known"}</p>
      <h2>{entry.name}</h2>
      <p>{entry.description}</p>
      <p className="meta">
        {entry.kind} · tier {entry.tier} · depth {entry.depth} · {entry.tags.join(", ")}
        {origin === "generated" && " · newly written by the model"}
      </p>
    </section>
  );
}
