const GLOBAL_KEY = "globalEnabled";
const CAPTURE_KEY = "captureEnabled";

const globalToggle = document.getElementById(
  "globalToggle",
) as HTMLInputElement;
const tabToggle = document.getElementById("tabToggle") as HTMLInputElement;
const tabSection = document.getElementById("tabSection") as HTMLElement;
const globalBadge = document.getElementById("globalBadge") as HTMLElement;
const shortcutHint = document.getElementById("shortcutHint") as HTMLElement;
const logo = document.getElementById("logo") as HTMLImageElement;

logo.src = chrome.runtime.getURL("images/mouse.svg");

const platform: string =
  (navigator as unknown as { userAgentData?: { platform: string } })
    .userAgentData?.platform ??
  navigator.platform ??
  "";
const isMac = platform.startsWith("Mac") || platform === "iPhone";
const mod = isMac ? "⌘" : "Ctrl";

shortcutHint.innerHTML = `<kbd>${mod}</kbd><span class="shortcut-plus">+</span><kbd>M</kbd>`;

let currentTabId: number | null = null;
let tabIsInjectable = true;
let globalEnabled = true;

async function getActiveTab(): Promise<{
  id: number | null;
  url: string | undefined;
}> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return { id: tabs[0]?.id ?? null, url: tabs[0]?.url };
}

function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return (
      protocol === "https:" || protocol === "http:" || protocol === "file:"
    );
  } catch {
    return false;
  }
}

function syncTabSectionDim(globalEnabled: boolean): void {
  const shouldDim = !globalEnabled || !tabIsInjectable;
  tabSection.classList.toggle("dimmed", shouldDim);
}

function applyGlobalUI(enabled: boolean): void {
  globalEnabled = enabled;
  globalToggle.checked = enabled;
  globalBadge.textContent = enabled ? "ON" : "OFF";
  globalBadge.className = enabled ? "badge badge--on" : "badge badge--off";
  syncTabSectionDim(enabled);
  const iconName = enabled ? "icon.png" : "icon_sleeping.png";
  const iconPath = chrome.runtime.getURL(`images/${iconName}`);
  chrome.action.setIcon({ path: iconPath });
}

function applyTabUI(enabled: boolean): void {
  tabToggle.checked = enabled;
}

async function init(): Promise<void> {
  const activeTab = await getActiveTab();
  currentTabId = activeTab.id;
  tabIsInjectable = isInjectableUrl(activeTab.url);

  if (!tabIsInjectable) {
    const sub = tabSection.querySelector(".label-sub");
    if (sub) sub.textContent = "Not available on this page";
    tabToggle.checked = false;
  }

  const [localResult, sessionResult] = await Promise.all([
    chrome.storage.local.get(GLOBAL_KEY),
    chrome.storage.session.get(CAPTURE_KEY),
  ]);

  const initialGlobalEnabled: boolean = localResult[GLOBAL_KEY] ?? true;
  const tabStates: Record<number, boolean> = sessionResult[CAPTURE_KEY] ?? {};
  const tabEnabled: boolean =
    currentTabId !== null ? (tabStates[currentTabId] ?? true) : true;

  applyGlobalUI(initialGlobalEnabled);
  applyTabUI(tabIsInjectable ? tabEnabled : false);

  chrome.storage.onChanged.addListener(
    (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && GLOBAL_KEY in changes) {
        applyGlobalUI(changes[GLOBAL_KEY].newValue ?? true);
      }
      if (
        area === "session" &&
        CAPTURE_KEY in changes &&
        currentTabId !== null &&
        tabIsInjectable
      ) {
        const updated: Record<number, boolean> =
          changes[CAPTURE_KEY].newValue ?? {};
        applyTabUI(updated[currentTabId] ?? true);
      }
    },
  );

  globalToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ [GLOBAL_KEY]: globalToggle.checked });
  });

  async function saveTabState(): Promise<void> {
    if (currentTabId === null || !tabIsInjectable) return;
    const sessionResult = await chrome.storage.session.get(CAPTURE_KEY);
    const updated = {
      ...(sessionResult[CAPTURE_KEY] ?? {}),
      [currentTabId]: tabToggle.checked,
    };
    await chrome.storage.session.set({ [CAPTURE_KEY]: updated });
  }

  tabToggle.addEventListener("change", async () => {
    await saveTabState();
  });

  window.addEventListener("keydown", async (e) => {
    if (e.key === "m" && (e.metaKey || e.ctrlKey)) {
      if (!globalEnabled || !tabIsInjectable) return;
      e.preventDefault();
      tabToggle.checked = !tabToggle.checked;
      await saveTabState();
    }
  });
}

init().catch(console.error);
