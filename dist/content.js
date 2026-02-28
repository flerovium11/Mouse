const GHOST_COLOR = "rgba(0,0,0,0.38)";
const COPIED_STYLES = [
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
  "overflowWrap"
];
function isNativeInput(el) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}
function getValue(el) {
  if (isNativeInput(el)) return el.value ?? "";
  return el.textContent ?? "";
}
function getCursorPos(el) {
  if (isNativeInput(el)) return el.selectionStart ?? el.value.length;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return getValue(el).length;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}
class GhostText {
  constructor() {
    this.overlay = null;
    this.activeInput = null;
    this.suggestion = "";
  }
  attach(input) {
    this.detach();
    this.activeInput = input;
    this.overlay = this.buildOverlay(input);
    document.body.appendChild(this.overlay);
    this.syncPosition();
  }
  detach() {
    var _a;
    (_a = this.overlay) == null ? void 0 : _a.remove();
    this.overlay = null;
    this.activeInput = null;
    this.suggestion = "";
  }
  show(suggestion) {
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
  accept() {
    if (!this.activeInput || !this.suggestion) return null;
    const input = this.activeInput;
    const accepted = this.suggestion;
    if (isNativeInput(input)) {
      const cursor = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, cursor) + accepted + input.value.slice(cursor);
      const newCursor = cursor + accepted.length;
      input.setSelectionRange(newCursor, newCursor);
    } else {
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
  render() {
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
    invisible.textContent = before.endsWith("\n") ? before + "​" : before;
    const ghost2 = document.createElement("span");
    ghost2.style.color = GHOST_COLOR;
    ghost2.textContent = this.suggestion;
    this.overlay.replaceChildren(invisible, ghost2);
  }
  buildOverlay(input) {
    const div = document.createElement("div");
    const cs = window.getComputedStyle(input);
    div.style.position = "absolute";
    div.style.pointerEvents = "none";
    div.style.zIndex = "2147483647";
    div.style.overflow = "hidden";
    div.style.userSelect = "none";
    div.style.background = "transparent";
    for (const prop of COPIED_STYLES) {
      div.style[prop] = cs[prop];
    }
    if (input instanceof HTMLInputElement) {
      div.style.whiteSpace = "nowrap";
    } else {
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-word";
    }
    return div;
  }
}
async function getSuggestions(ctx) {
  return ["test hello"];
}
const ghost = new GhostText();
const DEBOUNCE_MS = 500;
let debounceTimer = null;
function isTextInput(el) {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLElement && el.isContentEditable)) return false;
  if (el instanceof HTMLInputElement) {
    const allowed = ["text", "search", "email", "url", "password", ""];
    return allowed.includes(el.type);
  }
  return true;
}
function onFocusIn(e) {
  if (isTextInput(e.target)) {
    ghost.attach(e.target);
  }
}
function onFocusOut(e) {
  if (isTextInput(e.target)) {
    ghost.detach();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }
}
function onInput(e) {
  if (!isTextInput(e.target)) return;
  const input = e.target;
  ghost.clear();
  ghost.syncPosition();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    var _a, _b;
    const value = "value" in input ? input.value : input.textContent ?? "";
    if (!value.trim()) return;
    ({
      element: {
        tag: input.tagName.toLowerCase(),
        type: input instanceof HTMLInputElement ? input.type : void 0,
        label: (input.id ? (_b = (_a = document.querySelector(`label[for="${input.id}"]`)) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim() : void 0) ?? void 0,
        placeholder: "placeholder" in input ? input.placeholder || void 0 : void 0,
        nameAttr: "name" in input ? input.name || void 0 : void 0,
        ariaLabel: input.getAttribute("aria-label") ?? void 0
      }
    });
    getSuggestions().then((suggestions) => {
      if (suggestions.length > 0) ghost.show(suggestions[0]);
    });
  }, DEBOUNCE_MS);
}
function onKeyDown(e) {
  if (e.key === "Tab") {
    const accepted = ghost.accept();
    if (accepted !== null) {
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
function initCapture() {
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => ghost.syncPosition());
}
initCapture();
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "COMPLETION_RESULT") {
    console.log("Received suggestions:", msg.suggestions);
  }
});
//# sourceMappingURL=content.js.map
