import {
  CompletionContext,
  CompletionResultMessage,
  MessageType,
} from "@shared/types";
import { currentPageMetadata, isNativeInput, toPageElement } from "../utils";

type AttachedImage = { data: string; mimeType: string; objectUrl: string };

export class ChatUI {
  private container: HTMLDivElement | null = null;
  private promptInput: HTMLInputElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private imageStrip: HTMLDivElement | null = null;
  private activeInput: HTMLElement | null = null;
  private anchorTop = "";
  private anchorLeft = "";
  private anchorWidth = "";
  private loading = false;
  private images: AttachedImage[] = [];

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
    this.images.forEach((img) => URL.revokeObjectURL(img.objectUrl));
    this.images = [];
    this.container?.remove();
    this.container = null;
    this.promptInput = null;
    this.fileInput = null;
    this.imageStrip = null;
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

    // Image strip (hidden until images attached)
    const imageStrip = document.createElement("div");
    imageStrip.className = "mouse-prompt-images";
    container.appendChild(imageStrip);
    this.imageStrip = imageStrip;

    // Input row
    const row = document.createElement("div");
    row.className = "mouse-prompt-row";
    container.appendChild(row);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "What should I write?";
    input.className = "mouse-prompt-input";
    row.appendChild(input);
    this.promptInput = input;

    // Attach image button
    const attachBtn = document.createElement("button");
    attachBtn.className = "mouse-prompt-attach";
    attachBtn.type = "button";
    attachBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>`;
    row.appendChild(attachBtn);

    // Hidden file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    container.appendChild(fileInput);
    this.fileInput = fileInput;

    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
      const files = Array.from(fileInput.files ?? []);
      fileInput.value = "";
      files.forEach((file) => this.addImage(file));
    });

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

  private addImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(",");
      const data = dataUrl.slice(comma + 1);
      const mimeType = file.type;
      const objectUrl = URL.createObjectURL(file);

      const img: AttachedImage = { data, mimeType, objectUrl };
      this.images.push(img);
      this.renderImageStrip();
    };
    reader.readAsDataURL(file);
  }

  private renderImageStrip() {
    if (!this.imageStrip) return;
    this.imageStrip.innerHTML = "";
    this.imageStrip.style.display = this.images.length ? "flex" : "none";

    this.images.forEach((img, i) => {
      const wrap = document.createElement("div");
      wrap.className = "mouse-prompt-thumb";

      const imgEl = document.createElement("img");
      imgEl.src = img.objectUrl;
      wrap.appendChild(imgEl);

      const remove = document.createElement("button");
      remove.className = "mouse-prompt-thumb-remove";
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        URL.revokeObjectURL(img.objectUrl);
        this.images.splice(i, 1);
        this.renderImageStrip();
      });
      wrap.appendChild(remove);

      this.imageStrip!.appendChild(wrap);
    });
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
      images: this.images.map(({ data, mimeType }) => ({ data, mimeType })),
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

  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];

  const rect = range.getBoundingClientRect();
  if (rect.bottom !== 0 || rect.left !== 0) return rect;

  return null;
}
