// Ghost text overlay: positions a transparent div over the active input.
// - Native inputs (<input>/<textarea>): full-width overlay with invisible text
//   before cursor so the suggestion lands at the right column.
// - Contenteditable (e.g. Gmail): small overlay anchored directly to the caret.
//   No DOM mutation inside the editor — avoids interfering with the app's state.

import { type TextInput } from "../types";
import { getCursorPos, getValue, isNativeInput } from "../utils";

const COPIED_STYLES: (keyof CSSStyleDeclaration)[] = [
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "boxSizing",
  "textAlign",
  "direction",
  "textIndent",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
];

export class GhostText {
  private overlay: HTMLDivElement | null = null;
  private activeInput: HTMLElement | null = null;
  private suggestion = "";

  hasSuggestion(): boolean {
    return !!this.suggestion;
  }

  getSuggestion(): string {
    return this.suggestion;
  }

  attach(input: TextInput) {
    this.detach();
    this.activeInput = input;
    this.overlay = this.buildOverlay(input);
    document.body.appendChild(this.overlay);
    this.syncPosition();
  }

  detach() {
    this.overlay?.remove();
    this.overlay = null;
    this.activeInput = null;
    this.suggestion = "";
  }

  show(suggestion: string) {
    if (!this.activeInput || !this.overlay) return;
    if (!getValue(this.activeInput).trim()) return;
    this.suggestion = suggestion;
    this.render();
  }

  clear() {
    this.suggestion = "";
    if (this.overlay) this.overlay.replaceChildren();
  }

  /** Inserts the suggestion at the cursor. Returns the accepted text, or null if nothing to accept. */
  accept(): string | null {
    if (!this.activeInput || !this.suggestion) return null;
    const input = this.activeInput;
    const accepted = this.suggestion;

    if (isNativeInput(input)) {
      const cursor = input.selectionStart ?? input.value.length;
      input.value =
        input.value.slice(0, cursor) + accepted + input.value.slice(cursor);
      const newCursor = cursor + accepted.length;
      input.setSelectionRange(newCursor, newCursor);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // execCommand keeps Gmail's undo stack and internal model in sync
      input.focus();
      document.execCommand("insertText", false, accepted);
    }

    this.clear();
    return accepted;
  }

  syncPosition() {
    if (!this.activeInput || !this.overlay) return;

    if (isNativeInput(this.activeInput)) {
      const rect = this.activeInput.getBoundingClientRect();
      this.overlay.style.top = `${rect.top + window.scrollY}px`;
      this.overlay.style.left = `${rect.left + window.scrollX}px`;
      this.overlay.style.width = `${rect.width}px`;
      this.overlay.style.height = `${rect.height}px`;
    } else {
      // Contenteditable: re-anchor the overlay to the live caret position.
      // Called after scroll/resize to stay in sync.
      const caretRect = getCaretRect();
      if (caretRect) {
        const inputRect = this.activeInput.getBoundingClientRect();
        this.applyRects(caretRect, inputRect);
      }
    }
  }

  /**
   * Show a suggestion anchored to explicit rects — for canvas-based editors
   * like Google Docs where there's no DOM cursor or contenteditable to read from.
   * The ghost overlay is created/reused and positioned without touching the editor DOM.
   */
  showAtRects(
    suggestion: string,
    caretRect: DOMRect,
    containerRect: DOMRect,
    fontEl: HTMLElement,
  ): void {
    if (!suggestion) return;
    this.suggestion = suggestion;

    if (!this.overlay) {
      this.overlay = this.buildContentEditableOverlay(fontEl);
      document.body.appendChild(this.overlay);
    }

    this.overlay.textContent = suggestion;
    this.applyRects(caretRect, containerRect);
  }

  private applyRects(caretRect: DOMRect, containerRect: DOMRect): void {
    if (!this.overlay) return;
    this.overlay.style.top = `${caretRect.top + window.scrollY}px`;
    // Align to left edge of container so wrapped lines start at the margin
    this.overlay.style.left = `${containerRect.left + window.scrollX}px`;
    this.overlay.style.width = `${containerRect.width}px`;
    // Indent only the first line to the cursor position
    this.overlay.style.textIndent = `${caretRect.right - containerRect.left}px`;
    // Match exact line height so vertical alignment is pixel-perfect
    this.overlay.style.lineHeight = `${caretRect.height}px`;
    this.overlay.style.maxHeight = `${Math.max(0, containerRect.bottom - caretRect.top)}px`;
  }

  private render() {
    if (!this.activeInput || !this.overlay || !this.suggestion) return;
    const input = this.activeInput;

    if (isNativeInput(input)) {
      const cursor = getCursorPos(input);
      const before = getValue(input).slice(0, cursor);
      this.overlay.scrollTop = input.scrollTop;
      this.overlay.scrollLeft = input.scrollLeft;

      const invisible = document.createElement("span");
      invisible.style.color = "transparent";
      // A trailing \n in pre-wrap doesn't advance the line visually without something after it
      invisible.textContent = before.endsWith("\n") ? before + "\u200B" : before;

      const ghost = document.createElement("span");
      ghost.style.opacity = "0.38";
      ghost.textContent = this.suggestion;

      this.overlay.replaceChildren(invisible, ghost);
    } else {
      // Contenteditable: just set the text; syncPosition puts the overlay at the caret.
      this.overlay.textContent = this.suggestion;
      this.syncPosition();
    }
  }

  private buildOverlay(input: TextInput): HTMLDivElement {
    const div = document.createElement("div");
    const cs = window.getComputedStyle(input);

    div.style.position = "absolute";
    div.style.pointerEvents = "none";
    div.style.zIndex = "2147483647";
    div.style.userSelect = "none";
    div.style.background = "transparent";

    if (isNativeInput(input)) {
      div.style.overflow = "hidden";

      for (const prop of COPIED_STYLES) {
        (div.style as any)[prop] = cs[prop];
      }

      if (input instanceof HTMLInputElement) {
        div.style.whiteSpace = "nowrap";
      } else {
        div.style.whiteSpace = "pre-wrap";
        div.style.wordBreak = "break-word";
      }
    } else {
      this.applyContentEditableStyles(div, cs);
    }

    return div;
  }

  private buildContentEditableOverlay(fontEl: HTMLElement): HTMLDivElement {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.pointerEvents = "none";
    div.style.zIndex = "2147483647";
    div.style.userSelect = "none";
    div.style.background = "transparent";
    const cs = window.getComputedStyle(fontEl);
    this.applyContentEditableStyles(div, cs);
    return div;
  }

  private applyContentEditableStyles(
    div: HTMLDivElement,
    cs: CSSStyleDeclaration,
  ): void {
    // lineHeight, width, maxHeight are set dynamically via applyRects()
    div.style.opacity = "0.38";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordBreak = "break-word";
    div.style.overflow = "hidden";
    div.style.fontFamily = cs.fontFamily;
    div.style.fontSize = cs.fontSize;
    div.style.fontWeight = cs.fontWeight;
    div.style.color = cs.color;
  }
}

function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  // getClientRects()[0] is more reliable than getBoundingClientRect() for collapsed ranges
  const rects = range.getClientRects();
  return rects.length > 0 ? rects[0] : null;
}
