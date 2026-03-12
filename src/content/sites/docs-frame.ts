/**
 * Runs inside the Docs text-event-target iframe, injected by the parent
 * content script as a web-accessible resource (<script src="chrome-extension://…">).
 * Handles keyboard events in the iframe's own JS context and inserts text via
 * execCommand (trusted, because it runs inside the iframe).
 *
 * Communication (all messages carry a __mouse discriminator):
 *   iframe → parent:  requestCompletion | accept | clear
 *   parent → iframe:  suggestionState { active, text? }
 */

const DOUBLE_SHIFT_MS = 300;
let lastShiftTime = 0;
let suggestionActive = false;
let pendingSuggestion = "";

document.addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    if (e.key === "Shift") {
      const now = Date.now();
      if (now - lastShiftTime < DOUBLE_SHIFT_MS) {
        lastShiftTime = 0;
        window.parent.postMessage({ __mouse: "requestCompletion" }, "*");
      } else {
        lastShiftTime = now;
      }
    } else if (e.key === "Tab") {
      if (suggestionActive && pendingSuggestion) {
        e.preventDefault();
        e.stopPropagation();
        // Insert synchronously while user activation is valid (before any async round-trip)
        document.execCommand("insertText", false, pendingSuggestion);
        pendingSuggestion = "";
        suggestionActive = false;
        window.parent.postMessage({ __mouse: "accept" }, "*");
      }
    } else if (e.key === "Escape") {
      window.parent.postMessage({ __mouse: "clear" }, "*");
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      window.parent.postMessage({ __mouse: "clear" }, "*");
    }
  },
  true,
);

window.addEventListener("message", (e: MessageEvent) => {
  if (!e.data || typeof e.data.__mouse !== "string") return;

  if (e.data.__mouse === "suggestionState") {
    suggestionActive = !!(e.data as { active: boolean }).active;
    pendingSuggestion = suggestionActive ? String((e.data as { text?: string }).text ?? "") : "";
  }
});
