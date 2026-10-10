// How the overnight bake shares the PC: it works for a stretch and then rests, it stops at once
// when told to, and it stands aside whenever the game itself is using the model.

// Where the bake keeps everything, and the two small files other programs talk to it through.
export const BAKE_DIR = "var/bake";
// Written by the game server each time a player's call to the model starts or ends.
export const PLAYER_MARKER = "var/bake/player-active";
// Present while the bake is paused. `npm run bake -- pause` makes it and `resume` removes it.
export const PAUSE_FLAG = "var/bake/PAUSE";

export type PaceSettings = {
  // The share of the time spent working: 0.5 is half and half.
  share: number;
  workMinutes: number;
  unloadWhileResting: boolean;
  quietMinutes: number;
};

export type Pacer = ReturnType<typeof createPacer>;

// Everything the pacer needs from outside is handed in, so tests can run it against a made-up clock.
export function createPacer(deps: {
  settings: PaceSettings;
  // The time now, in milliseconds.
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  isPaused: () => boolean;
  // When the game last used the model, in milliseconds, or null if it never has.
  playerLastActive: () => number | null;
  // Tells Ollama to let go of the model.
  unload: () => Promise<unknown>;
  say?: (line: string) => void;
}) {
  const { settings, now, sleep, isPaused, playerLastActive, unload, say = () => {} } = deps;
  const quietMs = settings.quietMinutes * 60_000;
  // How long it has worked since its last rest.
  let workedMs = 0;

  const playerBusy = () => {
    const last = playerLastActive();
    return last !== null && now() - last < quietMs;
  };

  // Why the bake must not work right now, or null if it may. Checked between calls, and during
  // one: a call in progress is cut short the moment this stops being null.
  function holdReason(): "paused" | "player" | null {
    if (isPaused()) return "paused";
    if (playerBusy()) return "player";
    return null;
  }

  // Counts a piece of work toward the current stretch.
  function worked(ms: number): void {
    workedMs += ms;
  }

  // Waits until the bake may work. Returns at once when nothing is in the way.
  async function clearance(): Promise<void> {
    let told: string | null = null;
    for (;;) {
      const reason = holdReason();
      if (reason === "paused") {
        if (told !== reason) {
          say("Paused. The model has been let go. `npm run bake -- resume` carries on.");
          await unload();
        }
        told = reason;
        await sleep(2000);
        continue;
      }
      if (reason === "player") {
        // Someone is playing. The model is left loaded for them.
        if (told !== reason) say("Someone is playing. Standing aside until the game has been quiet for a while.");
        told = reason;
        await sleep(5000);
        continue;
      }
      if (workedMs >= settings.workMinutes * 60_000) {
        const restMs = Math.round((workedMs * (1 - settings.share)) / settings.share);
        workedMs = 0;
        if (restMs > 0) {
          say(`Resting for ${Math.round(restMs / 60_000)} minutes${settings.unloadWhileResting ? ", with the model let go" : ""}.`);
          if (settings.unloadWhileResting) await unload();
          // Rest in short steps, so a pause or a player is noticed the moment the rest ends.
          for (const until = now() + restMs; now() < until; ) await sleep(Math.min(5000, until - now()));
        }
        told = null;
        continue;
      }
      if (told !== null) say("Carrying on.");
      return;
    }
  }

  return { holdReason, worked, clearance };
}
