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
  prompt?: string,
  images?: { data: string; mimeType: string }[],
): Promise<Suggestion[]> {
  const endpoint = prompt !== undefined ? "/gen-detailed" : "/gen";
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: headers(uuid),
    body: JSON.stringify({
      pageMetadata: ctx.pageMetadata,
      content: ctx.content,
      element,
      recentActions,
      ...(prompt !== undefined && { additionalDetails: prompt }),
      ...(images?.length && { images }),
    }),
  });
  const { suggestions } = await res.json();
  return suggestions as Suggestion[];
}
