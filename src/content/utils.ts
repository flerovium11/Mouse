import { PageMetadata, PageElement } from "@shared/types";
import { getSurroundings } from "./extraction";

export function isNativeInput(
  el: HTMLElement,
): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

export function getValue(el: HTMLElement): string {
  if (isNativeInput(el)) return el.value ?? "";
  return el.textContent ?? "";
}

export function getCursorPos(el: HTMLElement): number {
  if (isNativeInput(el)) return el.selectionStart ?? el.value.length;
  // contenteditable: measure characters before the cursor via Selection API
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return getValue(el).length;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

export function isTextInput(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !(el instanceof HTMLElement && el.isContentEditable)
  )
    return false;
  if (el instanceof HTMLInputElement) {
    const allowed = ["text", "search", "email", "url", "password", ""];
    return allowed.includes(el.type);
  }
  return true;
}

export function toPageElement(
  el: HTMLElement,
  withSurroundings: boolean = false,
): PageElement {
  const isInput = isTextInput(el);

  return {
    tag: el.tagName.toLowerCase(),
    type: el instanceof HTMLInputElement ? el.type : undefined,
    label:
      (el.id
        ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
        : undefined) ?? undefined,
    value: isInput ? getValue(el) : undefined,
    textContent: !isInput ? el.textContent?.trim() : undefined,
    cursorPosition: isInput ? getCursorPos(el) : undefined,
    placeholder:
      "placeholder" in el
        ? (el as HTMLInputElement).placeholder || undefined
        : undefined,
    nameAttr:
      "name" in el ? (el as HTMLInputElement).name || undefined : undefined,
    ariaLabel: el.getAttribute("aria-label") ?? undefined,
    surroundings: withSurroundings ? getSurroundings(el) : undefined,
  };
}

export function currentPageMetadata(): PageMetadata {
  return {
    url: window.location.href,
    title: document.title,
    description:
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? undefined,
    domain: window.location.hostname,
  };
}

export function quickHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0; // unsigned 32-bit int
}

export function pageContextHash(ctx: {
  pageMetadata: PageMetadata;
  content: string;
}): number {
  const metaString = `${ctx.pageMetadata.url}|${ctx.pageMetadata.title}|${ctx.pageMetadata.description ?? ""}`;
  return quickHash(metaString + "|" + ctx.content);
}
