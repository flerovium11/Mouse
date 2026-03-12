import { extractContent, getSurroundings } from "./extraction";
import { isGoogleDocs, startDocsCapture } from "./sites/google-docs";
import { ChatUI } from "./ui/chat";
import { GhostText } from "./ui/ghost";
import {
  currentPageMetadata,
  getValue,
  isTextInput,
  pageContextHash,
  toPageElement,
} from "./utils";
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
export const chat = new ChatUI();

const DOUBLE_SHIFT_MS = 300;
let lastShiftTime = 0;
let activeInput: HTMLElement | null = null;

function targetsExtensionUI(target: EventTarget | null): boolean {
  if (!target) return false;
  const element = target as HTMLElement;
  return element.classList.contains("mouse-chat-input");
}

function onFocusIn(e: FocusEvent) {
  if (!isTextInput(e.target) || targetsExtensionUI(e.target)) return;
  activeInput = e.target;
  ghost.attach(e.target);
  e.target.dataset.valueOnFocus = getValue(e.target);
}

function onFocusOut(e: FocusEvent) {
  if (!isTextInput(e.target) || targetsExtensionUI(e.target)) return;
  activeInput = null;
  ghost.detach();
}

// TODO: This will send the entire page content on pages
//  that have different scroll containers than body.
//  Consider detecting these scroll containers (painful).
function isPageBodyScrollable(): boolean {
  return document.body.scrollHeight > window.innerHeight * 1.5;
}

async function sendPageContext() {
  const pageScrollable = isPageBodyScrollable();
  const minY = Math.max(window.scrollY - window.innerHeight * 0.5, 0);
  const maxY = Math.min(
    window.scrollY + window.innerHeight * 1.5,
    document.body.scrollHeight,
  );

  const pageContext: PageContext = {
    timestamp: Date.now(),
    pageMetadata: currentPageMetadata(),
    content: pageScrollable
      ? extractContent(minY, maxY)
      : extractContent(-Infinity, Infinity),
    contentBounds: pageScrollable
      ? {
          start: minY / document.body.scrollHeight,
          end: maxY / document.body.scrollHeight,
        }
      : { start: 0, end: 1 },
  };

  const hash = pageContextHash(pageContext);
  const storageKey = pageContext.pageMetadata.url + "_hash";
  const timeKey = pageContext.pageMetadata.url + "_time";
  const stored = await chrome.storage.session.get([storageKey, timeKey]);
  const age = stored[timeKey] ? Date.now() - stored[timeKey] : 0;
  const expired = age > 1000 * 60 * 30; // 30 minutes

  if (!expired && stored[storageKey] === hash) return;

  await chrome.storage.session.set({
    [storageKey]: hash,
    [timeKey]: Date.now(),
  });
  await chrome.runtime.sendMessage({
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
  if (targetsExtensionUI(e.target)) return;
  sendDOMActionMessage({
    type: "change",
    element: toPageElement(e.target as HTMLElement, true),
    previousValue: (e.target as HTMLElement).dataset.valueOnFocus,
  });
}

function clickDidSomething(e: MouseEvent): boolean {
  if (!e.target) return false;
  return !!(e.target as HTMLElement).closest(
    "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), " +
      'textarea:not(:disabled), label, [role="button"], [role="link"], ' +
      '[role="menuitem"], [role="tab"], [onclick]',
  );
}

function onClick(e: MouseEvent) {
  if (!clickDidSomething(e) || targetsExtensionUI(e.target)) return;

  sendDOMActionMessage({
    type: "click",
    element: toPageElement(e.target as HTMLElement, true),
  });
}

function onInput(e: Event) {
  if (!isTextInput(e.target) || targetsExtensionUI(e.target)) return;
  ghost.clear();
  ghost.syncPosition();
}

function requestCompletion(input: HTMLElement) {
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
}

function openChatWindow() {}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Shift") {
    const now = Date.now();
    if (now - lastShiftTime < DOUBLE_SHIFT_MS) {
      lastShiftTime = 0;
      if (activeInput) requestCompletion(activeInput);
    } else {
      lastShiftTime = now;
    }
  } else if (e.key === "Tab") {
    const accepted = ghost.accept();
    if (accepted !== null) {
      // Prevent Tab from moving focus only when we consumed it
      e.preventDefault();
      e.stopPropagation();
    }
  } else if (e.key === "Escape") {
    ghost.clear();
  } else if (e.key === "Enter") {
    if (e.metaKey || e.ctrlKey) {
      chat.attach(activeInput);
    }
  }
}

function onScroll() {
  ghost.syncPosition();
  chat.syncPosition();
  discoverNewScrollBounds();
}

function onNewUrlIdle() {
  sendPageContext();
}

let currentMinY = window.scrollY;
let currentMaxY = window.scrollY + window.innerHeight;
let pageScrollLoaded = false;

let saveNewScrollBoundsTimer: ReturnType<typeof setTimeout> | null = null;

async function discoverNewScrollBounds() {
  if (!pageScrollLoaded) return;
  const minY = window.scrollY;
  const maxY = minY + window.innerHeight;
  const newDiscoveryThreshold = window.innerHeight * 0.7;
  if (
    minY < currentMinY - newDiscoveryThreshold ||
    maxY > currentMaxY + newDiscoveryThreshold
  ) {
    currentMinY = Math.min(currentMinY, minY);
    currentMaxY = Math.max(currentMaxY, maxY);

    if (saveNewScrollBoundsTimer) clearTimeout(saveNewScrollBoundsTimer);
    saveNewScrollBoundsTimer = setTimeout(() => {
      sendPageContext();
      chrome.storage.session.set({
        [location.href + "_scroll"]: { minY: currentMinY, maxY: currentMaxY },
      });
    }, 3000);
  }
}

async function loadPageScrollFromSessionStorage() {
  const stored = await chrome.storage.session.get(location.href + "_scroll");
  const storedValue = stored[location.href + "_scroll"];

  if (storedValue) {
    currentMinY =
      storedValue.minY === undefined ? window.scrollY : storedValue.minY;
    currentMaxY =
      storedValue.maxY === undefined
        ? window.scrollY + window.innerHeight
        : storedValue.maxY;
  }

  pageScrollLoaded = true;
}

function onUrlChange(lastUrl: string) {
  sendDOMActionMessage({
    type: "navigation",
    lastUrl,
  });
  ghost.clear();
  pageScrollLoaded = false;
  loadPageScrollFromSessionStorage();
}

function onResize() {
  ghost.syncPosition();
  chat.syncPosition();
}

let mutationObserver: MutationObserver | null = null;
let stopDocsCapture: (() => void) | null = null;

export function startCapture(): void {
  console.info("The mouse is watching you 🐁");

  if (isGoogleDocs()) {
    stopDocsCapture = startDocsCapture(ghost);
  }

  currentMinY = window.scrollY;
  currentMaxY = window.scrollY + window.innerHeight;

  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown, true); // capture phase so we get it before the page
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  let lastUrl = location.href;
  // let dwellTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNewUrlIdle() {
    // if (dwellTimer) clearTimeout(dwellTimer);
    // dwellTimer = setTimeout(() => {
    //   sendPageContext();
    // }, 3000);
    waitForIdle(onNewUrlIdle);
  }

  // document.addEventListener("visibilitychange", () => {
  //   if (document.hidden && dwellTimer) {
  //     clearTimeout(dwellTimer);
  //     dwellTimer = null;
  //   }
  // });

  mutationObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      onUrlChange(lastUrl);
      lastUrl = location.href;
      scheduleNewUrlIdle();
    }
  });

  mutationObserver.observe(document.body, { subtree: true, childList: true });

  loadPageScrollFromSessionStorage();
  scheduleNewUrlIdle();
}

export function stopCapture(): void {
  console.info("The mouse is going to sleep 💤");

  stopDocsCapture?.();
  stopDocsCapture = null;;

  document.removeEventListener("focusin", onFocusIn);
  document.removeEventListener("focusout", onFocusOut);
  document.removeEventListener("input", onInput);
  document.removeEventListener("change", onChange);
  document.removeEventListener("click", onClick);
  document.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onResize);
  ghost.detach();
  chat.detach();
  mutationObserver?.disconnect();
  mutationObserver = null;
}

function waitForIdle(callback: () => void, quietMs = 1000, timeout = 10_000) {
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
