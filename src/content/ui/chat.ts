import {
  CompletionContext,
  CompletionResultMessage,
  MessageType,
} from "@shared/types";
import { currentPageMetadata, isNativeInput, toPageElement } from "../utils";

export class ChatUI {
  private container: HTMLDivElement | null = null;
  private promptInput: HTMLInputElement | null = null;
  private activeInput: HTMLElement | null = null;
  private anchorTop = "";
  private anchorLeft = "";
  private anchorWidth = "";
  private loading = false;

  attach(input: HTMLElement | null) {
    this.detach();
    this.activeInput = input;

    this.container = this.build();
    document.body.appendChild(this.container);

    this.syncPosition();
    this.promptInput?.focus();

    const onOutsideClick = (e: MouseEvent) => {
      if (!this.container?.contains(e.target as Node)) {
        this.detach();
        document.removeEventListener("mousedown", onOutsideClick, true);
      }
    };

    document.addEventListener("mousedown", onOutsideClick, true);
  }

  detach() {
    this.container?.remove();
    this.container = null;
    this.promptInput = null;
    this.activeInput = null;
    this.anchorTop = "";
    this.anchorLeft = "";
    this.anchorWidth = "";
    this.loading = false;
  }

  syncPosition() {
    if (!this.container || !this.activeInput) return;

    this.container.style.position = "absolute";

    if (isNativeInput(this.activeInput)) {
      const rect = this.activeInput.getBoundingClientRect();

      this.container.style.top = `${rect.bottom + window.scrollY + 8}px`;
      this.container.style.left = `${rect.left + window.scrollX}px`;
      this.container.style.width = `${rect.width}px`;
    } else {
      const caretRect = getCaretRect();
      const inputRect = this.activeInput.getBoundingClientRect();

      const anchor = caretRect ?? inputRect;

      this.container.style.top = `${anchor.bottom + window.scrollY + 8}px`;
      this.container.style.left = `${inputRect.left + window.scrollX}px`;
      this.container.style.width = `${inputRect.width}px`;
    }
  }

  private build(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "mouse-prompt";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "What should I write?";
    input.className = "mouse-prompt-input";
    container.appendChild(input);
    this.promptInput = input;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim() && !this.loading) {
        e.preventDefault();
        this.submit(input.value.trim());
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.detach();
      }
    });

    return container;
  }

  private submit(prompt: string) {
    if (!this.activeInput) {
      this.detach();
      return;
    }

    this.loading = true;
    if (this.promptInput) this.promptInput.disabled = true;

    const activeInput = this.activeInput;
    const context: CompletionContext = {
      timestamp: Date.now(),
      pageMetadata: currentPageMetadata(),
      element: toPageElement(activeInput, true),
      prompt,
    };

    chrome.runtime.sendMessage(
      { type: MessageType.REQUEST_COMPLETION, completionContext: context },
      (response: CompletionResultMessage) => {
        if (!response || response.error || !response.suggestions?.length) {
          this.detach();
          return;
        }
        this.insertResult(activeInput, response.suggestions[0].text);
        this.detach();
      },
    );
  }

  private insertResult(input: HTMLElement, text: string): void {
    if (isNativeInput(input)) {
      const nativeInput = input as HTMLInputElement;
      const cursor = nativeInput.selectionStart ?? nativeInput.value.length;
      nativeInput.value =
        nativeInput.value.slice(0, cursor) +
        text +
        nativeInput.value.slice(cursor);
      const newCursor = cursor + text.length;
      nativeInput.setSelectionRange(newCursor, newCursor);
      nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
      nativeInput.focus();
    } else {
      input.focus();
      document.execCommand("insertText", false, text);
    }
  }
}

function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  // getClientRects() works for most cases
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1]; // last rect = cursor end position

  // For collapsed ranges, getBoundingClientRect() returns a zero-size rect but with correct coords
  // Check bottom/left rather than width/height since width=0 for a cursor
  const rect = range.getBoundingClientRect();
  if (rect.bottom !== 0 || rect.left !== 0) return rect;

  return null;
}
