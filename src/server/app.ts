import { Hono, type Context } from "hono";
import { z } from "zod";
import { idSchema, responseTypeSchema } from "../shared/schema";
import { RuleError, type Combiner } from "./combiner";
import type { EventService } from "./events/service";
import { GenerationError } from "./llm/generate";
import type { ProgressService } from "./progress";
import type { ShopService } from "./shop";

const playerSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const combineBodySchema = z.object({ a: idSchema, b: idSchema });
const learnBodySchema = z.object({ spell: idSchema });
const buyBodySchema = z.object({ slot: z.number().int().min(0) });
const jobBodySchema = z.object({ job: idSchema });
const respondBodySchema = z.object({ type: responseTypeSchema, beat: z.number().int().min(1).optional() });
const testEventBodySchema = z.object({ seed: z.string().optional() });

// What the rules refuse comes back as { error, code }. `error` is a sentence for the player.
function refuse(c: Context, err: unknown) {
  if (err instanceof RuleError) {
    return c.json({ error: err.message, code: err.code }, err.code === "no-result" ? 422 : 400);
  }
  if (err instanceof GenerationError) {
    console.error(err.message);
    return c.json({ error: "The model could not produce a result. Try again." }, 502);
  }
  throw err;
}

export function createApp(combiner: Combiner, services?: { progress: ProgressService; shop: ShopService; events?: EventService }) {
  const app = new Hono();

  // Reads the player name and, when a schema is given, the JSON body. Returns null if either is bad.
  async function read<T>(c: Context, schema?: z.ZodType<T>): Promise<{ player: string; body: T } | null> {
    const player = playerSchema.safeParse(c.req.param("player"));
    if (!player.success) return null;
    if (!schema) return { player: player.data, body: undefined as T };
    const body = schema.safeParse(await c.req.json().catch(() => null));
    return body.success ? { player: player.data, body: body.data } : null;
  }
  const invalid = (c: Context) => c.json({ error: "Invalid request." }, 400);

  app.get("/api/players/:player", async (c) => {
    const request = await read(c);
    if (!request) return c.json({ error: "Invalid player name." }, 400);
    // Progress is read first: it pays out anything owed, which can itself be a discovery reward.
    const progress = services?.progress.getProgress(request.player);
    // Loading the page also picks up an event that was left half-written.
    services?.events?.prepare(request.player);
    return c.json({ entries: combiner.listDiscovered(request.player), ...(progress && { progress }) });
  });

  app.get("/api/jobs", (c) => c.json({ jobs: combiner.listJobs() }));

  app.post("/api/players/:player/combine", async (c) => {
    const request = await read(c, combineBodySchema);
    if (!request) return invalid(c);
    try {
      const result = await combiner.combine(request.player, request.body.a, request.body.b);
      if (!services) return c.json(result);
      const rewards = services.progress.settle(request.player);
      services.events?.prepare(request.player);
      return c.json({ ...result, rewards, progress: services.progress.getProgress(request.player) });
    } catch (err) {
      return refuse(c, err);
    }
  });

  if (services) {
    const { progress, shop, events } = services;

    if (events) {
      // Returns the event waiting on the player, or null. It answers at once: an event that is due
      // is written out of sight, and `progress.eventReady` turns true once it is waiting.
      app.get("/api/players/:player/event", async (c) => {
        const request = await read(c);
        if (!request) return invalid(c);
        try {
          return c.json(await events.current(request.player));
        } catch (err) {
          return refuse(c, err);
        }
      });

      // For testing: writes a fresh event now, whatever the player's points. `seed` is optional.
      app.post("/api/players/:player/event/test", async (c) => {
        const player = playerSchema.safeParse(c.req.param("player"));
        const body = testEventBodySchema.safeParse((await c.req.json().catch(() => null)) ?? {});
        if (!player.success || !body.success) return invalid(c);
        try {
          return c.json(await events.test(player.data, body.data.seed));
        } catch (err) {
          return refuse(c, err);
        }
      });

      app.post("/api/players/:player/event/respond", async (c) => {
        const request = await read(c, respondBodySchema);
        if (!request) return invalid(c);
        try {
          const result = await events.respond(request.player, request.body.type, request.body.beat);
          // What an event pays out can be enough to earn the next one.
          events.prepare(request.player);
          return c.json({ ...result, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });
    }

    app.post("/api/players/:player/learn", async (c) => {
      const request = await read(c, learnBodySchema);
      if (!request) return invalid(c);
      try {
        const learned = progress.learn(request.player, request.body.spell);
        events?.prepare(request.player);
        return c.json({ ...learned, progress: progress.getProgress(request.player) });
      } catch (err) {
        return refuse(c, err);
      }
    });

    // Takes up a job the player has discovered. It is theirs until they take up another.
    app.post("/api/players/:player/job", async (c) => {
      const request = await read(c, jobBodySchema);
      if (!request) return invalid(c);
      try {
        const { rewards } = progress.chooseJob(request.player, request.body.job);
        events?.prepare(request.player);
        return c.json({ rewards, progress: progress.getProgress(request.player) });
      } catch (err) {
        return refuse(c, err);
      }
    });

    app.get("/api/players/:player/shop", async (c) => {
      const request = await read(c);
      return request ? c.json(shop.view(request.player)) : invalid(c);
    });

    app.post("/api/players/:player/shop/buy", async (c) => {
      const request = await read(c, buyBodySchema);
      if (!request) return invalid(c);
      try {
        const { entry, rewards } = shop.buy(request.player, request.body.slot);
        events?.prepare(request.player);
        return c.json({ entry, rewards, progress: progress.getProgress(request.player), shop: shop.view(request.player) });
      } catch (err) {
        return refuse(c, err);
      }
    });
  }

  return app;
}
