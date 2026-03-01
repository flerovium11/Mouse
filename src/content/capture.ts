import { extractContent, getSurroundings } from "./extraction";
import { GhostText } from "./ghost";
import { currentPageMetadata, isTextInput, toPageElement } from "./utils";
import {
  CompletionContext,
  CompletionResultMessage,
  DOMAction,
  DOMActionMessage,
  MessageType,
  PageContext,
  PageContextMessage,
} from "@shared/types";

export const ghost = new GhostText();

const DEBOUNCE_MS = 500;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

function sendPageContext() {
  const pageContext: PageContext = {
    timestamp: Date.now(),
    pageMetadata: currentPageMetadata(),
    content: extractContent(),
  };

  chrome.runtime.sendMessage({
    type: MessageType.PAGE_CONTEXT,
    pageContext,
  } as PageContextMessage);
}

function sendDOMActionMessage(
  action: Omit<DOMAction, "timestamp" | "pageMetadata" | "id">,
) {
  chrome.runtime.sendMessage({
    type: MessageType.DOM_ACTION,
    action: {
      ...action,
      id: crypto.randomUUID(),
      pageMetadata: currentPageMetadata(),
      timestamp: Date.now(),
    },
  } as DOMActionMessage);
}

function onChange(e: Event) {
  sendDOMActionMessage({
    type: "change",
    element: toPageElement(e.target as HTMLElement, true),
  });
}

function onClick(e: MouseEvent) {
  sendDOMActionMessage({
    type: "click",
    element: toPageElement(e.target as HTMLElement, true),
  });
}

function onInput(e: Event) {
  if (!isTextInput(e.target)) return;
  const input = e.target;

  ghost.clear();
  ghost.syncPosition();

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const value =
      "value" in input
        ? (input as HTMLInputElement).value
        : ((input as HTMLElement).textContent ?? "");
    if (!value.trim()) return;
    const completionContext: CompletionContext = {
      timestamp: Date.now(),
      pageMetadata: currentPageMetadata(),
      element: toPageElement(input, true),
    };

    chrome.runtime.sendMessage(
      { type: MessageType.REQUEST_COMPLETION, completionContext },
      (response: CompletionResultMessage) => {
        if (response.error) {
          console.error("Error from background:", response.error);
          return;
        }

        if (response.suggestions.length > 0)
          ghost.show(response.suggestions[0].text);
      },
    );
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

  const storageKey = `scroll_${location.href}`;
}

function onUrlChange(lastUrl: string) {
  sendDOMActionMessage({
    type: "navigation",
    lastUrl,
  });
  ghost.clear();
}

export function initCapture(): void {
  console.info("Initializing content script capture");

  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown, true); // capture phase so we get it before the page
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => ghost.syncPosition());

  let lastUrl = location.href;
  // let dwellTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleSend() {
    // if (dwellTimer) clearTimeout(dwellTimer);
    // dwellTimer = setTimeout(() => {
    //   sendPageContext();
    // }, 3000);
    waitForIdle(sendPageContext);
  }

  // document.addEventListener("visibilitychange", () => {
  //   if (document.hidden && dwellTimer) {
  //     clearTimeout(dwellTimer);
  //     dwellTimer = null;
  //   }
  // });

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      onUrlChange(lastUrl);
      lastUrl = location.href;
      scheduleSend();
    }
  });

  observer.observe(document.body, { subtree: true, childList: true });

  scheduleSend();
}

function waitForIdle(callback: () => void, quietMs = 1000, timeout = 8000) {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const start = Date.now();

  const observer = new MutationObserver(() => {
    if (idleTimer) clearTimeout(idleTimer);
    if (Date.now() - start > timeout) {
      observer.disconnect();
      callback();
      return;
    }
    idleTimer = setTimeout(() => {
      observer.disconnect();
      callback();
    }, quietMs);
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  // Fallback if page is already idle
  idleTimer = setTimeout(() => {
    observer.disconnect();
    callback();
  }, quietMs);
}
