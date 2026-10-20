import { Hono, type Context } from "hono";
import { z } from "zod";
import { idSchema, responseTypeSchema } from "../shared/schema";
import { RuleError, type Combiner } from "./combiner";
import type { DayService, DayTurn } from "./day";
import type { EventService } from "./events/service";
import { GenerationError, ModelOff } from "./llm/generate";
import type { ProgressService } from "./progress";
import type { ShiftService } from "./shifts/service";
import type { StoryService } from "./story/service";
import type { TestSaveService } from "./testSaves";
import type { ShopService } from "./shop";
import type { TownService } from "./town";

const playerSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const combineBodySchema = z.object({ a: idSchema, b: idSchema });
const learnBodySchema = z.object({ spell: idSchema });
const buyBodySchema = z.object({ slot: z.number().int().min(0) });
const jobBodySchema = z.object({ job: idSchema });
// A staple's id has a colon in it ("staple:scrap"), so these are plain strings, checked against what is on offer.
const optionIdSchema = z.string().min(1).max(80);
const shiftBodySchema = z.object({ order: z.number().int().min(1), base: optionIdSchema, method: optionIdSchema, touch: optionIdSchema.nullable().optional() });
const respondBodySchema = z.object({ type: responseTypeSchema, beat: z.number().int().min(1).optional() });
const testEventBodySchema = z.object({ seed: z.string().optional() });
const plotSchema = z.number().int().min(0);
const buildBodySchema = z.object({ plot: plotSchema, building: idSchema });
const upgradeBodySchema = z.object({ plot: plotSchema });
const stockBodySchema = z.object({ plot: plotSchema, slot: z.number().int().min(0), entry: idSchema.nullable() });
const handBodySchema = z.object({ plot: plotSchema });
const callBodySchema = z.object({ person: z.number().int().min(1) });
const enchantBodySchema = z.object({ plot: plotSchema, spell: idSchema });

// What the rules refuse comes back as { error, code }. `error` is a sentence for the player.
function refuse(c: Context, err: unknown) {
  if (err instanceof RuleError) {
    return c.json({ error: err.message, code: err.code }, err.code === "no-result" ? 422 : 400);
  }
  // The model is turned off: the player sees the reminder itself, so it is fixed.
  if (err instanceof ModelOff) return c.json({ error: err.message, code: "model-off" }, 503);
  if (err instanceof GenerationError) {
    console.error(err.message);
    return c.json({ error: "The model could not produce a result. Try again." }, 502);
  }
  throw err;
}

// Every route that returns `progress` also says what the action did to the day: `night` is the
// ledger when it brought night on, and `dusk` a line when it brought the evening on. Most do neither.
const SAME_DAY: DayTurn = { night: null, dusk: null };

export function createApp(
  combiner: Combiner,
  services?: { progress: ProgressService; shop: ShopService; day: DayService; town?: TownService; events?: EventService; shifts?: ShiftService; story?: StoryService; testSaves?: TestSaveService },
) {
  const app = new Hono();

  // A story beat is played whenever anything is settled, so after every request about a player
  // the scenes of any beat just played are set writing, out of sight.
  const afterPlayer = async (c: Context, next: () => Promise<void>) => {
    await next();
    const player = playerSchema.safeParse(c.req.param("player"));
    if (player.success) services?.story?.prepare(player.data);
  };
  app.use("/api/players/:player", afterPlayer);
  app.use("/api/players/:player/*", afterPlayer);

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
    services?.shifts?.prepare(request.player);
    return c.json({ entries: combiner.listDiscovered(request.player), ...(progress && { progress, ...SAME_DAY }) });
  });

  app.get("/api/jobs", (c) => c.json({ jobs: combiner.listJobs() }));

  // Dev only: the test saves, for the page's picker, and starting one over without stopping the
  // server. A player not named in data/test-saves.json is refused, so a real save is never wiped.
  const testSaves = services?.testSaves;
  if (testSaves) {
    app.get("/api/test-saves", (c) => c.json({ saves: testSaves.list() }));
    app.post("/api/test-saves/:player/reset", async (c) => {
      const player = playerSchema.safeParse(c.req.param("player"));
      if (!player.success) return invalid(c);
      try {
        // Anything still being written out of sight for the player finishes first, so it
        // cannot land in the save after it has been rebuilt.
        await Promise.all([services.events?.idle(player.data), services.shifts?.idle(player.data), services.story?.idle(player.data)]);
        await testSaves.reset(player.data);
        return c.json({ player: player.data, progress: services.progress.getProgress(player.data) });
      } catch (err) {
        return refuse(c, err);
      }
    });
  }

  app.post("/api/players/:player/combine", async (c) => {
    const request = await read(c, combineBodySchema);
    if (!request) return invalid(c);
    try {
      const result = await combiner.combine(request.player, request.body.a, request.body.b);
      if (!services) return c.json(result);
      // A job, once discovered, brings its townsperson.
      services.town?.arrive(request.player);
      const rewards = services.progress.settle(request.player);
      // A new discovery moves the sun, and past dusk it burns the midnight oil.
      const turn = services.day.combined(request.player, result);
      services.events?.prepare(request.player);
      return c.json({ ...result, rewards, ...turn, progress: services.progress.getProgress(request.player) });
    } catch (err) {
      return refuse(c, err);
    }
  });

  if (services) {
    const { progress, shop, day, town, events, shifts } = services;

    if (town) {
      // The street: plots, what stands on them, who has arrived, and the plans in hand.
      app.get("/api/players/:player/town", async (c) => {
        const request = await read(c);
        return request ? c.json(town.view(request.player)) : invalid(c);
      });

      // Everyone in town, for the People tab.
      app.get("/api/players/:player/town/people", async (c) => {
        const request = await read(c);
        return request ? c.json(town.people(request.player)) : invalid(c);
      });

      // Buys the next plot along. Free of the hour: this can be done at any time of day.
      app.post("/api/players/:player/town/plots", async (c) => {
        const request = await read(c);
        if (!request) return invalid(c);
        try {
          const bought = town.buyPlot(request.player);
          return c.json({ ...bought, ...SAME_DAY, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Raises a new building on an empty plot, and raises one a tier. Evening actions: each
      // takes hourglasses, and the last hourglass brings night.
      app.post("/api/players/:player/town/build", async (c) => {
        const request = await read(c, buildBodySchema);
        if (!request) return invalid(c);
        try {
          const raised = town.build(request.player, request.body.plot, request.body.building);
          return c.json({ ...raised, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Puts a discovery on a shelf, or clears the shelf with `entry: null`. Free, at any hour.
      app.post("/api/players/:player/town/stock", async (c) => {
        const request = await read(c, stockBodySchema);
        if (!request) return invalid(c);
        try {
          town.stock(request.player, request.body.plot, request.body.slot, request.body.entry);
          return c.json({ rewards: { gold: 0, quests: [] }, ...SAME_DAY, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Lends a hand at a building: one hourglass, once a building an evening.
      app.post("/api/players/:player/town/hand", async (c) => {
        const request = await read(c, handBodySchema);
        if (!request) return invalid(c);
        try {
          const lent = town.hand(request.player, request.body.plot);
          return c.json({ rewards: { gold: 0, quests: [] }, ...lent, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Calls on a townsperson, or anyone the player has met: one hourglass, once a person a night.
      app.post("/api/players/:player/town/call", async (c) => {
        const request = await read(c, callBodySchema);
        if (!request) return invalid(c);
        try {
          const called = town.call(request.player, request.body.person);
          return c.json({ ...called, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // A meal at the Tavern: gold and an hourglass. Tomorrow's discoveries pay more.
      app.post("/api/players/:player/town/meal", async (c) => {
        const request = await read(c);
        if (!request) return invalid(c);
        try {
          const ate = town.meal(request.player);
          return c.json({ ...ate, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Casts a learned spell on a building: one hourglass.
      app.post("/api/players/:player/town/enchant", async (c) => {
        const request = await read(c, enchantBodySchema);
        if (!request) return invalid(c);
        try {
          const cast = town.enchant(request.player, request.body.plot, request.body.spell);
          return c.json({ ...cast, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Takes part in tonight's happening where there is something to do: the pedlar's pack, or
      // the stargazer's hint. No hourglass.
      app.post("/api/players/:player/town/tonight", async (c) => {
        const request = await read(c);
        if (!request) return invalid(c);
        try {
          const took = town.tonight(request.player);
          return c.json({ ...took, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      app.post("/api/players/:player/town/upgrade", async (c) => {
        const request = await read(c, upgradeBodySchema);
        if (!request) return invalid(c);
        try {
          const raised = town.upgrade(request.player, request.body.plot);
          return c.json({ ...raised, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });

      // Hires the person who has come to run the building on a plot. Gold once, by its tier.
      app.post("/api/players/:player/town/hire", async (c) => {
        const request = await read(c, upgradeBodySchema);
        if (!request) return invalid(c);
        try {
          const hired = town.hire(request.player, request.body.plot);
          return c.json({ ...hired, ...SAME_DAY, progress: progress.getProgress(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });
    }

    // Ends the day as far as the player may. From dusk this is going to bed, and `night` comes
    // back. From noon it is turning in early: dusk comes on now, with a shorter evening.
    app.post("/api/players/:player/day/end", async (c) => {
      const request = await read(c);
      if (!request) return invalid(c);
      try {
        const turn = day.end(request.player);
        // Picks up a visitor left half-written. A new one waits for the morning to get going.
        events?.prepare(request.player);
        return c.json({ rewards: progress.settle(request.player), ...turn, progress: progress.getProgress(request.player) });
      } catch (err) {
        return refuse(c, err);
      }
    });

    if (shifts) {
      // The order board for the job the player has taken up, and what they may fill an order with.
      // The board is written ahead, out of sight, so this never waits on the model: whatever is
      // written shows now, and an order still in the plain template is the model's by the next look.
      app.get("/api/players/:player/shift", async (c) => {
        const request = await read(c);
        return request ? c.json(shifts.board(request.player)) : invalid(c);
      });

      // Works one order from the board with the things chosen.
      app.post("/api/players/:player/shift", async (c) => {
        const request = await read(c, shiftBodySchema);
        if (!request) return invalid(c);
        try {
          const worked = shifts.work(request.player, request.body);
          events?.prepare(request.player);
          shifts.prepare(request.player);
          return c.json({ ...worked, progress: progress.getProgress(request.player), shift: shifts.board(request.player) });
        } catch (err) {
          return refuse(c, err);
        }
      });
    }

    if (events) {
      // Returns the event in front of the player, or null. The day's visitor is only seen from
      // dusk. It answers at once: the visitor is written out of sight from the first thing the
      // player makes that day, and `progress.eventReady` turns true once they are waiting.
      app.get("/api/players/:player/event", async (c) => {
        const request = await read(c);
        if (!request) return invalid(c);
        try {
          return c.json(await events.current(request.player));
        } catch (err) {
          return refuse(c, err);
        }
      });

      // For testing: writes a fresh event now, at any time of day, for no hourglass. `seed` is optional.
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
          // Sitting with the day's visitor is an evening action, and takes an hourglass when it ends.
          const result = await events.respond(request.player, request.body.type, request.body.beat);
          // Carries on writing whatever was being written for a testing event's later beats.
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
        return c.json({ ...learned, ...SAME_DAY, progress: progress.getProgress(request.player) });
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
        return c.json({ rewards, ...SAME_DAY, progress: progress.getProgress(request.player) });
      } catch (err) {
        return refuse(c, err);
      }
    });

    // The shelf, once a building has opened the shop. Before that it is refused with `no-shop`.
    app.get("/api/players/:player/shop", async (c) => {
      const request = await read(c);
      if (!request) return invalid(c);
      try {
        return c.json(shop.view(request.player));
      } catch (err) {
        return refuse(c, err);
      }
    });

    app.post("/api/players/:player/shop/buy", async (c) => {
      const request = await read(c, buyBodySchema);
      if (!request) return invalid(c);
      try {
        const { entry, rewards } = shop.buy(request.player, request.body.slot);
        events?.prepare(request.player);
        return c.json({ entry, rewards, ...SAME_DAY, progress: progress.getProgress(request.player), shop: shop.view(request.player) });
      } catch (err) {
        return refuse(c, err);
      }
    });
  }

  return app;
}
