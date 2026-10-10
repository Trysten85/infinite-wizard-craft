import { describe, expect, it, vi } from "vitest";
import { readModelConfig } from "../src/server/llm/config";
import { createModelTurns } from "../src/server/llm/turns";
import type { LlmCompletion, LlmRequest } from "../src/server/llm/types";

const root = process.cwd();

describe("the model settings", () => {
  it("name one model, thinking less for combinations than for events", () => {
    const config = readModelConfig(root, {});
    expect(config.model).toBe("gpt-oss:20b");
    expect(config.effort).toMatchObject({ combos: "low", events: "medium" });
    // The call that decides what a thing is has a level of its own.
    expect(config.effort.naming).toBeTruthy();
    expect(config.keepAlive).toBeTruthy();
    // The model is only ever reached on the host-only network.
    expect(config.url).toMatch(/^http:\/\/192\.168\.56\./);
  });

  it("can be overridden for one run, and send no effort level to a different model", () => {
    const config = readModelConfig(root, { OLLAMA_MODEL: "gemma3:12b", OLLAMA_URL: "http://192.168.56.1:9999" });
    expect(config).toMatchObject({ model: "gemma3:12b", url: "http://192.168.56.1:9999", effort: { combos: null, naming: null, events: null } });
    expect(readModelConfig(root, { OLLAMA_MODEL: "gpt-oss:20b" }).effort.events).toBe("medium");
  });
});

// A model that answers only when told to, and stops a call that is cut short.
function slowModel() {
  const calls: { request: LlmRequest; answer: (text: string) => void; cut: boolean }[] = [];
  const client = {
    model: "slow",
    complete(request: LlmRequest): Promise<LlmCompletion> {
      return new Promise((resolve, reject) => {
        const call = { request, answer: (text: string) => resolve({ text, promptTokens: 0, completionTokens: 0 }), cut: false };
        calls.push(call);
        request.signal?.addEventListener("abort", () => {
          call.cut = true;
          reject(new DOMException("cut short", "AbortError"));
        });
      });
    },
  };
  return { client, calls };
}
const request: LlmRequest = { system: "s", prompt: "p", jsonSchema: {}, temperature: 0 };

describe("taking turns at the model", () => {
  it("cuts background writing short for a player's call, then starts it again", async () => {
    const { client, calls } = slowModel();
    const turns = createModelTurns({ quietSeconds: 0, giveWayTimes: 4 });
    const event = turns.inBackground(client).complete({ ...request, prompt: "event" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    const combo = turns.forPlayer(client).complete({ ...request, prompt: "combo" });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]!.cut).toBe(true);
    // The background does not start again while the player is still waiting.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls).toHaveLength(2);
    calls[1]!.answer("beach");
    expect((await combo).text).toBe("beach");

    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]!.request.prompt).toBe("event");
    calls[2]!.answer("a visitor");
    expect((await event).text).toBe("a visitor");
  });

  it("stops giving way after a set number of times, so an event cannot be put off forever", async () => {
    const { client, calls } = slowModel();
    const turns = createModelTurns({ quietSeconds: 0, giveWayTimes: 1 });
    const event = turns.inBackground(client).complete(request);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const first = turns.forPlayer(client).complete(request);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1]!.answer("one");
    await first;
    await vi.waitFor(() => expect(calls).toHaveLength(3));

    const second = turns.forPlayer(client).complete(request);
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[2]!.cut).toBe(false);
    calls[2]!.answer("a visitor");
    calls[3]!.answer("two");
    expect((await event).text).toBe("a visitor");
    expect((await second).text).toBe("two");
  });

  it("passes on a real failure instead of trying again", async () => {
    const turns = createModelTurns({ quietSeconds: 0, giveWayTimes: 4 });
    const broken = { model: "broken", complete: vi.fn(async () => Promise.reject(new Error("no answer"))) };
    await expect(turns.inBackground(broken).complete(request)).rejects.toThrow("no answer");
    expect(broken.complete).toHaveBeenCalledTimes(1);
  });
});
