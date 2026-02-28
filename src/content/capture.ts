import { GhostText } from "./ghost";

export const ghost = new GhostText();

const DEBOUNCE_MS = 500;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function isTextInput(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement  {if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLElement && el.isContentEditable)) return false;
if (el instanceof HTMLInputElement) {
  const allowed = ["text", "search", "email", "url", "password", ""];
  return allowed.includes(el.type);
}
return true;
}

function onFocusIn(e: FocusEvent) {
  if (isTextInput(e.target)) {
    ghost.attach(e.target);
  }
}

function onFocusOut(e: FocusEvent) {
  if (isTextInput(e.target)) {
    ghost.detach();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }
}

function onInput(e: Event) {
  if (!isTextInput(e.target)) return;
  const input = e.target;

  ghost.clear();
  ghost.syncPosition();

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const value = "value" in input ? (input as HTMLInputElement).value : (input as HTMLElement).textContent ?? "";
    if (!value.trim()) return;
    ghost.show("lorem ipsum dolor sit amet"); //TODO: Implement suggestion logic
    chrome.runtime.sendMessage({
      type: "REQUEST_COMPLETION",
      value: "value" in input ? (input as HTMLInputElement).value : (input as HTMLElement).textContent ?? "",
      cursorPos: (input as HTMLInputElement).selectionStart ?? (input as HTMLInputElement).value?.length ?? 0,
    });
  }, DEBOUNCE_MS);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Tab") {
    const accepted = ghost.accept();
    if (accepted !== null) {
      // Prevent Tab from moving focus only when we consumed it
      e.preventDefault();
      e.stopPropagation();
    }
  } else if (e.key === "Escape") {
    ghost.clear();
  }
}

function onScroll() {
  ghost.syncPosition();
}

export function initCapture(): void {
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKeyDown, true); // capture phase so we get it before the page
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => ghost.syncPosition());
}
