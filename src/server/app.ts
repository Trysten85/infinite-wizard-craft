import { Hono } from "hono";
import { z } from "zod";
import { idSchema } from "../shared/schema";
import { RuleError, type Combiner } from "./combiner";
import { GenerationError } from "./llm/generate";

const playerSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const combineBodySchema = z.object({ a: idSchema, b: idSchema });

export function createApp(combiner: Combiner) {
  const app = new Hono();

  app.get("/api/players/:player", (c) => {
    const player = playerSchema.safeParse(c.req.param("player"));
    if (!player.success) return c.json({ error: "Invalid player name." }, 400);
    return c.json({ entries: combiner.listDiscovered(player.data) });
  });

  app.post("/api/players/:player/combine", async (c) => {
    const player = playerSchema.safeParse(c.req.param("player"));
    const body = combineBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!player.success || !body.success) return c.json({ error: "Invalid request." }, 400);
    try {
      return c.json(await combiner.combine(player.data, body.data.a, body.data.b));
    } catch (err) {
      if (err instanceof RuleError) return c.json({ error: err.message }, 400);
      if (err instanceof GenerationError) {
        console.error(err.message);
        return c.json({ error: "The model could not produce a result. Try again." }, 502);
      }
      throw err;
    }
  });

  return app;
}
