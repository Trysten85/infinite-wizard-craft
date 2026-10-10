import type { LlmClient } from "./types";

// The model answers one call at a time, and a call that arrives while another is running waits
// for all of it. So writing done out of sight gives way to a call a player is waiting on: it is
// cut short the moment one arrives, and started again from the top once things have been quiet.
export function createModelTurns(options: {
  // How long after a player's call the background waits before starting again.
  quietSeconds: number;
  // How many times one background call gives way. After that it runs to the end, so that a busy
  // player cannot put an event off forever.
  giveWayTimes: number;
  // Told whenever a player's call starts or ends, so that work in other programs (the overnight
  // bake) can stand aside too.
  onPlayerCall?: () => void;
}) {
  const quietMs = options.quietSeconds * 1000;
  let playersWaiting = 0;
  let lastPlayerCall = -Infinity;
  const cutShort = new Set<AbortController>();

  async function untilQuiet(forMs: number): Promise<void> {
    for (;;) {
      const left = playersWaiting > 0 ? 100 : lastPlayerCall + forMs - performance.now();
      if (left <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, Math.min(left, 500)));
    }
  }

  return {
    forPlayer(client: LlmClient): LlmClient {
      return {
        model: client.model,
        async complete(request) {
          playersWaiting++;
          options.onPlayerCall?.();
          for (const controller of cutShort) controller.abort();
          try {
            return await client.complete(request);
          } finally {
            playersWaiting--;
            lastPlayerCall = performance.now();
            options.onPlayerCall?.();
          }
        },
      };
    },

    inBackground(client: LlmClient): LlmClient {
      return {
        model: client.model,
        async complete(request) {
          for (let gaveWay = 0; ; gaveWay++) {
            const lastTry = gaveWay >= options.giveWayTimes;
            await untilQuiet(lastTry ? 0 : quietMs);
            if (lastTry) return client.complete(request);
            const controller = new AbortController();
            cutShort.add(controller);
            try {
              return await client.complete({ ...request, signal: controller.signal });
            } catch (err) {
              // Cut short for a player. Anything else is a real failure.
              if (!controller.signal.aborted) throw err;
            } finally {
              cutShort.delete(controller);
            }
          }
        },
      };
    },
  };
}
