const excludeSelectors = [
  "script",
  "noscript",
  "canvas",
  "style",
  "head",
  "header",
  "footer",
  "nav",
  "aside",
  "#header",
  "#footer",
  "#sidebar",
  ".ads",
  ".advertisement",
  ".cookie-consent",
  ".cookie-notice",
  ".cookie-consent-banner",
  ".cookie-banner",
  ".newsletter-signup",
  "[aria-hidden='true']",
  "[hidden]",
  "[role='alertdialog']",
  "[role='dialog']",
];

export function extractContent(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  excludeSelectors.forEach((sel) => {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  });

  if (!clone) return "";

  return htmlToMarkdown(clone, false);
}

function htmlToMarkdown(
  element: HTMLElement | ChildNode,
  textContentOnly: boolean = true,
  minY: number = 0,
  maxY: number = Infinity,
): string {
  let result = "";

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    if (getComputedStyle(el).display === "none") continue;
    // const rect = el.getBoundingClientRect();
    // if (rect.width === 0 || rect.height === 0) continue;

    // const absTop = rect.top + window.scrollY;
    // const absBottom = absTop + rect.height;
    // if (absBottom < minY || absTop > maxY) continue;

    const tag = el.tagName.toLowerCase();
    const inner = htmlToMarkdown(el, textContentOnly, minY, maxY).trim();

    switch (tag) {
      case "h1":
        result += `# ${inner}\n\n`;
        break;
      case "h2":
        result += `## ${inner}\n\n`;
        break;
      case "h3":
        result += `### ${inner}\n\n`;
        break;
      case "h4":
        result += `#### ${inner}\n\n`;
        break;
      case "h5":
        result += `##### ${inner}\n\n`;
        break;
      case "h6":
        result += `###### ${inner}\n\n`;
        break;
      case "p":
        result += `${inner}\n\n`;
        break;
      case "br":
        result += `\n`;
        break;
      case "strong":
      case "b":
        result += `**${inner}**`;
        break;
      case "em":
      case "i":
        result += `*${inner}*`;
        break;
      case "s":
      case "del":
        result += `~~${inner}~~`;
        break;
      case "code":
        result += `\`${inner}\``;
        break;
      case "pre":
        result += `\`\`\`\n${el.textContent}\n\`\`\`\n\n`;
        break;
      case "blockquote":
        result +=
          inner
            .split("\n")
            .map((l: string) => `> ${l}`)
            .join("\n") + "\n\n";
        break;
      case "a": {
        if (textContentOnly) result += inner;
        const href = el.getAttribute("href") ?? "";
        result += `[${inner}](${href.slice(0, 30)})`;
        break;
      }
      case "img": {
        if (textContentOnly) break;
        const src = el.getAttribute("src") ?? "";
        const alt = el.getAttribute("alt") ?? "";
        result += `![${alt}](${src})`;
        break;
      }
      case "ul": {
        el.querySelectorAll<HTMLLIElement>(":scope > li").forEach((li) => {
          result += `- ${htmlToMarkdown(li, textContentOnly, minY, maxY).trim()}\n`;
        });
        result += "\n";
        break;
      }
      case "ol": {
        let i = 1;
        el.querySelectorAll<HTMLLIElement>(":scope > li").forEach((li) => {
          result += `${i++}. ${htmlToMarkdown(li, textContentOnly, minY, maxY).trim()}\n`;
        });
        result += "\n";
        break;
      }
      case "hr":
        result += `---\n\n`;
        break;
      case "table": {
        const rows = [...el.querySelectorAll<HTMLTableRowElement>("tr")];
        rows.forEach((row, rowIdx) => {
          const cells = [
            ...row.querySelectorAll<HTMLTableCellElement>("th, td"),
          ].map((c) => htmlToMarkdown(c, textContentOnly, minY, maxY).trim());
          result += `| ${cells.join(" | ")} |\n`;
          if (rowIdx === 0)
            result += `| ${cells.map(() => "---").join(" | ")} |\n`;
        });
        result += "\n";
        break;
      }
      default:
        result += inner;
    }
  }

  return result
    .replace(/\n{3,}/g, "\n\n") // max 2 consecutive newlines
    .replace(/[ \t]+/g, " ") // collapse spaces/tabs
    .trim();
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

function innerText(el: HTMLElement): string {
  const parts: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = (n as Text).parentElement!;
      if (excludeSelectors.some((sel) => parent.matches(sel)))
        return NodeFilter.FILTER_REJECT;
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
      if (excludeSelectors.some((sel) => sib?.matches(sel))) {
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
