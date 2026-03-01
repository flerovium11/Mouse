// Basic content extraction experiment

import { PageChunk } from "@shared/types";

const INTERACTIVE_TAGS = new Set([
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "BUTTON",
  "A",
]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG"]);
const MAX_CHUNK_SIZE = 700;

/** When splitting, look this many chars beyond the limit for a sentence boundary */
const BOUNDARY_EXTRA = 100;

// Collect inner text of a subtree, skipping hidden/script nodes
function innerText(el: HTMLElement): string {
  const parts: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = (n as Text).parentElement!;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (getComputedStyle(parent).display === "none")
        return NodeFilter.FILTER_REJECT;
      const t = n.textContent?.trim() ?? "";
      return t.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let n: Node | null;
  while ((n = w.nextNode())) parts.push(n.textContent!.trim());
  return parts.join(" ");
}

export function extractChunks(): PageChunk[] {
  const chunks: PageChunk[] = [];
  let current = "";
  let i = 0;

  function flush(force = false) {
    if (current.length > MAX_CHUNK_SIZE) {
      const searchStr = current.slice(0, MAX_CHUNK_SIZE + BOUNDARY_EXTRA);

      const match = [...searchStr.matchAll(/[.!?]\s+/g)].at(-1);
      const splitAt =
        match && match.index! > 100
          ? match.index! + match[0].length // split after the whitespace
          : MAX_CHUNK_SIZE;

      chunks.push({
        id: `${location.href}#chunk${i++}`,
        content: current.slice(0, splitAt).trim(),
      });
      current = current.slice(splitAt);
    } else if (force && current.trim().length > 30) {
      chunks.push({
        id: `${location.href}#chunk${i++}`,
        content: current.trim(),
      });
      current = "";
    }
  }

  function append(text: string) {
    if (!text) return;
    current += " " + text;
    flush();
  }

  const visited = new WeakSet<Node>();

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (getComputedStyle(el).display === "none")
            return NodeFilter.FILTER_REJECT;

          const isInteractive =
            INTERACTIVE_TAGS.has(el.tagName) ||
            el.onclick !== null ||
            el.getAttribute("role") === "button";

          if (isInteractive) {
            // Accept the element itself, but mark its descendants so text
            // nodes inside don't get double-emitted
            const descendants = el.querySelectorAll("*");
            visited.add(el);
            descendants.forEach((d) => visited.add(d));
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        }

        // Text node — skip if already captured by a parent interactive element
        if (visited.has((node as Text).parentElement!))
          return NodeFilter.FILTER_SKIP;

        const el = (node as Text).parentElement!;
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (getComputedStyle(el).display === "none")
          return NodeFilter.FILTER_REJECT;
        const text = node.textContent?.trim() ?? "";
        return text.length > 10
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    append(nodeToString(node));
  }

  flush(true);
  return chunks;
}

function nodeToString(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.trim() || "";
  }

  if (node instanceof HTMLInputElement) {
    const hint = node.placeholder || node.ariaLabel || node.name || "";
    switch (node.type) {
      case "checkbox":
        return `[${node.checked ? "x" : " "}] ${hint}`;
      case "radio":
        return `(${node.checked ? "•" : " "}) ${hint}`;
      case "submit":
      case "button":
        return `[btn: ${node.value || hint}]`;
      default:
        return `[input: ${hint}${node.value ? ` = "${node.value}"` : ""}]`;
    }
  }

  if (node instanceof HTMLSelectElement) {
    const selected = node.options[node.selectedIndex]?.text ?? "";
    const options = Array.from(node.options)
      .map((o) => o.text)
      .join(" | ");
    return `[select: ${selected} | ${options}]`;
  }

  if (node instanceof HTMLTextAreaElement) {
    const hint = node.placeholder || node.ariaLabel || node.name || "";
    return `[textarea: ${hint}${node.value ? ` = "${node.value}"` : ""}]`;
  }

  if (node instanceof HTMLButtonElement) {
    const label = innerText(node) || node.ariaLabel || node.name || "";
    return label.length > 3 ? `[btn: ${label}]` : "";
  }

  if (node instanceof HTMLAnchorElement) {
    const label = innerText(node) || node.ariaLabel || "";
    return label.length > 3 ? `[link: ${label}]` : "";
  }

  if (
    node instanceof HTMLElement &&
    (node.onclick || node.getAttribute("role") === "button")
  ) {
    const label = node.getAttribute("aria-label") || innerText(node) || "";
    return label.length > 3 ? `[clickable: ${label}]` : "";
  }

  return node.textContent?.trim() || "";
}

export function getSurroundings(el: HTMLElement): string {
  const parts: string[] = [];

  const headings: string[] = [];
  let node: Element | null = el;
  while (node) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (/^h[1-6]$/i.test(sib.tagName)) {
        headings.unshift(`h${sib.tagName[1]}: ${sib.textContent?.trim()}`);
        break;
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  if (headings.length) parts.push(`[headings: ${headings.join(" > ")}]`);

  const group = el.closest("fieldset, [role='group'], [role='radiogroup']");
  if (group) {
    const labelledById = group.getAttribute("aria-labelledby");
    const legend =
      group.querySelector("legend")?.textContent?.trim() ||
      group.getAttribute("aria-label") ||
      (labelledById
        ? document.getElementById(labelledById)?.textContent?.trim()
        : "");
    if (legend) parts.push(`[group: ${legend}]`);
  }

  const labelText = resolveLabel(el);
  if (labelText) parts.push(`[label: ${labelText}]`);

  const describedBy = el.getAttribute("aria-describedby");
  if (describedBy) {
    const desc = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (desc) parts.push(`[hint: ${desc}]`);
  }

  const precedingText = getNearestPrecedingText(el);
  if (precedingText) parts.push(`[context: ${precedingText}]`);

  const form = el.closest("form, [role='form']") ?? el.parentElement;
  if (form) {
    const fields = Array.from(
      form.querySelectorAll<HTMLElement>("input, textarea, select"),
    ).filter((f) => {
      if (f instanceof HTMLInputElement) {
        return !["hidden", "submit", "reset", "button", "image"].includes(
          f.type,
        );
      }
      return true;
    });

    const fieldReprs = fields.map((f) => {
      const isCurrent = f === el;
      const label = resolveLabel(f);
      const value = getFieldValue(f);
      const marker = isCurrent ? " ← FOCUSED" : "";
      return `${label || f.getAttribute("name") || "?"}: ${value}${marker}`;
    });

    if (fieldReprs.length)
      parts.push(`[form fields:\n  ${fieldReprs.join("\n  ")}]`);
  }

  return parts.join("\n");
}

function resolveLabel(el: HTMLElement): string {
  if (el.id) {
    const explicit = document.querySelector<HTMLLabelElement>(
      `label[for="${el.id}"]`,
    );
    if (explicit) return explicit.textContent?.trim() ?? "";
  }
  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("input, select, textarea")
      .forEach((f) => f.remove());
    return clone.textContent?.trim() ?? "";
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  return (el as HTMLInputElement).placeholder ?? "";
}

function getFieldValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return el.checked ? "[checked]" : "[unchecked]";
    if (el.type === "radio") return el.checked ? "[selected]" : "[unselected]";
    return el.value ? `"${el.value}"` : "[empty]";
  }
  if (el instanceof HTMLSelectElement) {
    return el.options[el.selectedIndex]?.text ?? "[none]";
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value ? `"${el.value}"` : "[empty]";
  }
  return "[empty]";
}

function getNearestPrecedingText(el: HTMLElement): string {
  let node: Element | null = el;
  while (node) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (SKIP_TAGS.has((sib as HTMLElement).tagName)) {
        sib = sib.previousElementSibling;
        continue;
      }
      const text = innerText(sib as HTMLElement).trim();
      if (text.length > 20 && !/^h[1-6]$/i.test(sib.tagName)) {
        return text.slice(0, 200);
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
}
