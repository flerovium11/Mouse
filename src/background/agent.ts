import { CompletionContext, Suggestion } from "@shared/types";

/** Builds suggestions from PageContext + retrieved memories */
export async function getSuggestions(
  ctx: CompletionContext,
): Promise<Suggestion[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { text: "test hello", confidence: 0.9, type: "completion" },
        { text: "test world", confidence: 0.5, type: "completion" },
      ]);
    }, 500);
  });
}
