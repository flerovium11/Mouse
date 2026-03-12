import type { DOMAction, PageContext, PageElement, Suggestion } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL as string;

const TOKEN_KEY = "authToken";

async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string) || null;
}

export async function setAuthToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function getStoredAuthToken(): Promise<string | null> {
  return getAuthToken();
}

const headers = async (uuid?: string) => {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (uuid) h["X-User-Id"] = uuid;

  const token = await getAuthToken();
  if (token) h["Authorization"] = `Bearer ${token}`;

  return h;
};

export async function register(): Promise<string> {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: await headers(),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const { uuid } = await res.json();
  return uuid as string;
}

export async function dump(uuid: string, ctx: PageContext): Promise<void> {
  await fetch(`${BASE}/dump`, {
    method: "POST",
    headers: await headers(uuid),
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
    headers: await headers(uuid),
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
