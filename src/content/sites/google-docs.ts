/**
 * Google Docs integration — main-frame side.
 *
 * The docs-texteventtarget-iframe is sandboxed so Chrome won't inject content
 * scripts into it. However the sandbox has allow-same-origin, so we can inject
 * a web-accessible-resource script (<script src="chrome-extension://…">) into
 * the iframe from here. That script (docs-frame.ts) runs in the iframe's own
 * JS context and can call execCommand with full browser trust.
 *
 * Communication (all messages carry a __mouse discriminator):
 *   iframe → parent:  requestCompletion | accept | clear
 *   parent → iframe:  insert { text }  |  suggestionState { active }
 */

import {
  CompletionContext,
  CompletionResultMessage,
  MessageType,
} from "@shared/types";
import { type GhostText } from "../ghost";
import { currentPageMetadata } from "../utils";

export function isGoogleDocs(): boolean {
  return window.location.hostname === "docs.google.com";
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function getCursorEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".kix-cursor");
}

/**
 * The .kix-cursor blinks via display:none so getBoundingClientRect() returns
 * zeros when hidden. Read position from the CSS transform instead.
 */
function getCursorRect(): DOMRect | null {
  const cursorEl = getCursorEl();
  const editorEl = getEditorEl();
  if (!cursorEl || !editorEl) return null;

  const m = cursorEl.style.transform.match(
    /translate\(\s*([\d.]+)px\s*,\s*([\d.]+)px\s*\)/,
  );
  if (!m) return null;

  const caretEl = cursorEl.querySelector<HTMLElement>(".kix-cursor-caret");
  const height = caretEl ? parseFloat(caretEl.style.height) || 16 : 16;
  const editorRect = editorEl.getBoundingClientRect();

  return new DOMRect(
    editorRect.left + parseFloat(m[1]),
    editorRect.top + parseFloat(m[2]),
    1,
    height,
  );
}

function getEditorEl(): HTMLElement | null {
  // .kix-page is the letter-sized page box with margins; prefer over the wider
  // .kix-appview-editor viewport container.
  return (
    document.querySelector<HTMLElement>(".kix-page") ??
    document.querySelector<HTMLElement>(".kix-appview-editor") ??
    document.querySelector<HTMLElement>(".docs-editor-container")
  );
}

/**
 * Return an element whose computed font styles match the Docs editor text.
 * In canvas mode no DOM node carries the right font, so we build a synthetic
 * off-screen div populated from the DOCS_modelChunk default text style, falling
 * back to Google Docs' well-known default (Arial 11pt).
 */
function getFontEl(): HTMLElement {
  // In HTML-rendering mode the word nodes have the right computed styles.
  const wordNode = document.querySelector<HTMLElement>(
    ".kix-wordhtmlgenerator-word-node",
  );
  if (wordNode) return wordNode;

  // Canvas mode: build a synthetic element with Docs' font.
  let fontFamily = "Arial";
  let fontSize = "11pt";

  for (const script of document.querySelectorAll("script")) {
    const raw = script.textContent ?? "";
    const m = raw.match(/DOCS_modelChunk\s*=\s*(\{[\s\S]*?\});/);
    if (!m) break;
    try {
      const chunk = JSON.parse(m[1]) as {
        chunk: Array<{ ty: string; sm?: Record<string, unknown> }>;
      };
      for (const op of chunk.chunk) {
        if (op.ty !== "as") continue;
        // hs_nt = "heading normal text" = the body text style
        const nt = (op.sm as { hs_nt?: { sdef_ts?: { ts_ff?: string; ts_fs?: number } } })?.hs_nt?.sdef_ts;
        if (nt?.ts_ff) fontFamily = nt.ts_ff;
        if (nt?.ts_fs) fontSize = `${nt.ts_fs}pt`;
        if (nt) break;
      }
    } catch {/* ignore */}
    break;
  }

  const div = document.createElement("div");
  div.style.cssText = `position:fixed;top:-9999px;font-family:${fontFamily};font-size:${fontSize};font-weight:normal;color:#000;`;
  document.body.appendChild(div);
  // Returned to caller; ghost.ts reads getComputedStyle() on it immediately.
  // We remove it after a tick so it doesn't accumulate.
  setTimeout(() => div.remove(), 0);
  return div;
}

function getDocsIframe(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(
    ".docs-texteventtarget-iframe",
  );
}

function notifyIframe(msg: Record<string, unknown>): void {
  getDocsIframe()?.contentWindow?.postMessage(msg, "*");
}

// ── Text extraction ──────────────────────────────────────────────────────────

/**
 * Canvas-mode Docs doesn't populate DOM paragraph nodes. The document text is
 * embedded as DOCS_modelChunk JSON in a <script> tag. Extract "insert-string"
 * ops from it — good enough context for the LLM.
 */
function getDocsTextFromModelChunk(): string {
  for (const script of document.querySelectorAll("script")) {
    const raw = script.textContent ?? "";
    const m = raw.match(/DOCS_modelChunk\s*=\s*(\{[\s\S]*?\});/);
    if (!m) continue;
    try {
      const chunk = JSON.parse(m[1]) as {
        chunk: Array<{ ty: string; s?: string }>;
      };
      return chunk.chunk
        .filter((op) => op.ty === "is" && op.s)
        .map((op) => op.s!)
        .join("");
    } catch {
      /* malformed — try next */
    }
  }
  return "";
}

function getDocsTextBeforeCursor(): string {
  const paragraphs = [
    ...document.querySelectorAll<HTMLElement>(".kix-paragraphrenderer"),
  ];
  if (paragraphs.length) {
    const joined = paragraphs.map((p) => p.textContent ?? "").join("\n").trim();
    // If paragraphs exist but are empty (canvas mode), fall back to model chunk
    if (!joined) return getDocsTextFromModelChunk();

    const cursorRect = getCursorRect();
    if (!cursorRect) return joined;

    const cursorTop = cursorRect.top;
    const texts: string[] = [];
    for (const para of paragraphs) {
      texts.push(para.textContent ?? "");
      if (para.getBoundingClientRect().bottom > cursorTop - 2) break;
    }
    return texts.join("\n").trim();
  }
  return getDocsTextFromModelChunk();
}

// ── Completion ───────────────────────────────────────────────────────────────

function requestDocsCompletion(ghost: GhostText, onShown: (text: string) => void): void {
  const text = getDocsTextBeforeCursor();
  if (!text) return;

  const completionContext: CompletionContext = {
    timestamp: Date.now(),
    pageMetadata: currentPageMetadata(),
    element: {
      tag: "div",
      ariaLabel: "Google Docs editor",
      value: text,
      cursorPosition: text.length,
    },
  };

  chrome.runtime.sendMessage(
    { type: MessageType.REQUEST_COMPLETION, completionContext },
    (response: CompletionResultMessage) => {
      if (response?.error || !response?.suggestions?.length) return;

      const caretRect = getCursorRect();
      const editorEl = getEditorEl();
      const fontEl = getFontEl();
      if (!caretRect || !editorEl || !fontEl) return;

      const suggestion = response.suggestions[0].text;
      ghost.showAtRects(
        suggestion,
        caretRect,
        editorEl.getBoundingClientRect(),
        fontEl,
      );
      onShown(suggestion);
    },
  );
}

// ── Capture ──────────────────────────────────────────────────────────────────

/**
 * Inject docs-frame.js into the Docs text-event-target iframe as a
 * web-accessible-resource <script>. The iframe's CSP allows scripts from our
 * extension origin, and the sandbox's allow-same-origin lets us access
 * contentDocument. The injected script runs in the iframe's own JS context so
 * its execCommand calls are browser-trusted.
 */
export function startDocsCapture(ghost: GhostText): () => void {
  let injected = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function tryInject(): void {
    if (injected) return;
    const iframe = getDocsIframe();
    const doc = iframe?.contentDocument;
    if (!doc) return;

    injected = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    const script = doc.createElement("script");
    script.src = chrome.runtime.getURL("dist/docs-frame.js");
    (doc.head ?? doc.documentElement).appendChild(script);
  }

  function onMessage(e: MessageEvent): void {
    const data = e.data as Record<string, unknown> | null;
    if (!data || typeof data.__mouse !== "string") return;

    if (data.__mouse === "requestCompletion") {
      requestDocsCompletion(ghost, (text) => {
        notifyIframe({ __mouse: "suggestionState", active: true, text });
      });
    } else if (data.__mouse === "accept") {
      ghost.clear();
      notifyIframe({ __mouse: "suggestionState", active: false });
    } else if (data.__mouse === "clear") {
      if (ghost.hasSuggestion()) {
        ghost.clear();
        notifyIframe({ __mouse: "suggestionState", active: false });
      }
    }
  }

  tryInject();
  if (!injected) {
    pollTimer = setInterval(tryInject, 500);
  }

  window.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener("message", onMessage);
    if (pollTimer) clearInterval(pollTimer);
  };
}
