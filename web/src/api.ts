import type { CombineResult, GameEntry } from "../../src/shared/schema";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status}).`);
  return body as T;
}

export function fetchDiscovered(player: string): Promise<GameEntry[]> {
  return request<{ entries: GameEntry[] }>(`/api/players/${player}`).then((body) => body.entries);
}

export function combine(player: string, a: string, b: string): Promise<CombineResult> {
  return request<CombineResult>(`/api/players/${player}/combine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a, b }),
  });
}
