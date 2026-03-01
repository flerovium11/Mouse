import type { DOMAction, PageContext, PageElement, Suggestion } from "./types";

export async function register(): Promise<string> {
  const mockUuid = "mock-uuid-1234";
  console.log("Mock register called, returning UUID:", mockUuid);
  return mockUuid;
}

export async function dump(uuid: string, ctx: PageContext): Promise<void> {
  console.log("Mock dump called with:", { uuid, ctx });
}

export async function gen(
  uuid: string,
  ctx: PageContext,
  element: PageElement,
  recentActions: DOMAction[],
): Promise<Suggestion[]> {
  console.log("Mock gen called with:", { uuid, ctx, element, recentActions });
  return [
    { text: "Mock suggestion 1", confidence: 0.9, type: "completion" },
    { text: "Mock suggestion 2", confidence: 0.8, type: "enhancement" },
    { text: "Mock suggestion 3", confidence: 0.7, type: "correction" },
  ];
}
