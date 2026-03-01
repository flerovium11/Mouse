// Ghost text overlay: positions a transparent div over the active input,
// with invisible typed text followed by gray suggestion text — so the gray
// text appears exactly at the cursor position.

import { type TextInput } from "./types";
import { getCursorPos, getValue, isNativeInput } from "./utils";

const GHOST_COLOR = "rgba(0,0,0,0.38)";

const COPIED_STYLES: (keyof CSSStyleDeclaration)[] = [
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
    } else {
      // contenteditable: insert at current selection
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(accepted));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    this.clear();
    return accepted;
  }

  syncPosition() {
    if (!this.activeInput || !this.overlay) return;
    const rect = this.activeInput.getBoundingClientRect();
    this.overlay.style.top = `${rect.top + window.scrollY}px`;
    this.overlay.style.left = `${rect.left + window.scrollX}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
  }

  private render() {
    if (!this.activeInput || !this.overlay || !this.suggestion) return;
    const input = this.activeInput;
    const cursor = getCursorPos(input);
    const before = getValue(input).slice(0, cursor);

    if (isNativeInput(input)) {
      this.overlay.scrollTop = input.scrollTop;
      this.overlay.scrollLeft = input.scrollLeft;
    }

    const invisible = document.createElement("span");
    invisible.style.color = "transparent";
    // A trailing \n in pre-wrap doesn't advance the line visually without something after it
    invisible.textContent = before.endsWith("\n") ? before + "\u200B" : before;

    const ghost = document.createElement("span");
    ghost.style.color = GHOST_COLOR;
    ghost.textContent = this.suggestion;

    this.overlay.replaceChildren(invisible, ghost);
  }

  private buildOverlay(input: TextInput): HTMLDivElement {
    const div = document.createElement("div");
    const cs = window.getComputedStyle(input);

    div.style.position = "absolute";
    div.style.pointerEvents = "none";
    div.style.zIndex = "2147483647";
    div.style.overflow = "hidden";
    div.style.userSelect = "none";
    div.style.background = "transparent";

    for (const prop of COPIED_STYLES) {
      (div.style as any)[prop] = cs[prop];
    }

    // Override after copying so these aren't clobbered by the loop above
    if (input instanceof HTMLInputElement) {
      div.style.whiteSpace = "nowrap";
    } else {
      // textarea and contenteditable must render newlines
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-word";
    }

    return div;
  }
}
