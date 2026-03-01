import type { DOMAction, PageContext, PageElement, Suggestion } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL as string;

const headers = (uuid: string) => ({
  "Content-Type": "application/json",
  "X-User-Id": uuid,
});

export async function register(): Promise<string> {
  const res = await fetch(`${BASE}/register`, { method: "POST" });
  const { uuid } = await res.json();
  return uuid as string;
}

export async function dump(uuid: string, ctx: PageContext): Promise<void> {
  await fetch(`${BASE}/dump`, {
    method: "POST",
    headers: headers(uuid),
    body: JSON.stringify({
      pageMetadata: ctx.pageMetadata,
      content: ctx.content,
    }),
  });
}

export async function gen(
  uuid: string,
  ctx: PageContext,
  element: PageElement,
  recentActions: DOMAction[],
): Promise<Suggestion[]> {
  const res = await fetch(`${BASE}/gen`, {
    method: "POST",
    headers: headers(uuid),
    body: JSON.stringify({
      pageMetadata: ctx.pageMetadata,
      content: ctx.content,
      element,
      recentActions,
    }),
  });
  const { suggestions } = await res.json();
  return suggestions as Suggestion[];
}
