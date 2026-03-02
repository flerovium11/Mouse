import { Message, MessageType } from "@shared/types";
import { startCapture, stopCapture } from "./capture";
import "./content.css";

const mouseImageUrl = chrome.runtime.getURL("images/mouse.svg");
const mouseSleepingImageUrl = chrome.runtime.getURL(
  "images/mouse_sleeping.svg",
);

const mouseImage = document.createElement("img");
mouseImage.src = mouseImageUrl;
mouseImage.className = "mouse-image";

const mouseSleepingImage = document.createElement("img");
mouseSleepingImage.src = mouseSleepingImageUrl;
mouseSleepingImage.className = "mouse-sleeping-image";

const platform: string =
  (navigator as unknown as { userAgentData?: { platform: string } })
    .userAgentData?.platform ??
  navigator.platform ??
  "";
const modifierKeyPrefix =
  platform.startsWith("Mac") || platform === "iPhone" ? "⌘" : "Ctrl";
const shortcutHint = document.createElement("div");
shortcutHint.className = "shortcut-hint";
shortcutHint.innerHTML = `${modifierKeyPrefix} + M`;

const activeToggle = document.createElement("div");
activeToggle.className = "mouse-active-toggle";
activeToggle.appendChild(mouseImage);
activeToggle.appendChild(mouseSleepingImage);
activeToggle.appendChild(shortcutHint);
document.body.appendChild(activeToggle);

let captureEnabled = true;
let globalEnabled = true;
let tabId: number | null = null;

function getTabId(): Promise<number> {
  if (tabId !== null) return Promise.resolve(tabId);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: MessageType.GET_TAB_ID },
      (response: Message) => {
        if (response?.type === MessageType.TAB_ID_RESPONSE) {
          tabId = response.tabId;
          resolve(tabId);
        }
      },
    );
  });
}

const STORAGE_KEY = "captureEnabled";
const GLOBAL_KEY = "globalEnabled";

async function loadCaptureState(): Promise<boolean> {
  const tabId = await getTabId();
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return result[STORAGE_KEY]?.[tabId] ?? true;
}

async function saveCaptureState(enabled: boolean): Promise<void> {
  const id = await getTabId();
  const result = await chrome.storage.session.get(STORAGE_KEY);
  const updated = { ...(result[STORAGE_KEY] || {}), [id]: enabled };
  await chrome.storage.session.set({ [STORAGE_KEY]: updated });
}

async function loadGlobalState(): Promise<boolean> {
  const result = await chrome.storage.local.get(GLOBAL_KEY);
  return result[GLOBAL_KEY] ?? true;
}

let blinkTimeout: ReturnType<typeof setTimeout> | null = null;
function blink(): void {
  if (!activeToggle.classList.contains("active")) return;
  activeToggle.classList.add("blink");
  setTimeout(
    () => activeToggle.classList.remove("blink"),
    Math.random() * 100 + 50,
  );
  blinkTimeout = setTimeout(blink, Math.random() * 10_000 + 500);
}

let isAnimating = false;

function showActivationAnimation(): void {
  if (isAnimating) return;
  isAnimating = true;

  const overlay = document.createElement("div");
  overlay.className = "activation-animation";
  document.documentElement.appendChild(overlay);

  overlay.addEventListener("animationend", () => {
    overlay.remove();
    isAnimating = false;
  });
}

function applyState(animate: boolean = true): void {
  if (blinkTimeout) {
    clearTimeout(blinkTimeout);
    blinkTimeout = null;
  }

  if (!globalEnabled) {
    activeToggle.style.display = "none";
    stopCapture();
    return;
  }

  activeToggle.style.display = "";

  if (captureEnabled) {
    activeToggle.classList.add("active");
    startCapture();
    blink();
    if (animate) showActivationAnimation();
  } else {
    activeToggle.classList.remove("active");
    stopCapture();
  }
}

initToggle();

async function initToggle() {
  [globalEnabled, captureEnabled] = await Promise.all([
    loadGlobalState(),
    loadCaptureState(),
  ]);
  applyState(false);

  // Keep state in sync with popup (and other tabs)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && GLOBAL_KEY in changes) {
      const newValue = changes[GLOBAL_KEY].newValue ?? true;
      if (newValue === globalEnabled) return;
      globalEnabled = newValue;
      applyState();
    }
    if (area === "session" && STORAGE_KEY in changes) {
      if (tabId === null) return;
      const newValue = changes[STORAGE_KEY].newValue?.[tabId] ?? true;
      if (newValue === captureEnabled) return;
      captureEnabled = newValue;
      applyState();
    }
  });

  activeToggle.addEventListener("click", async () => {
    if (hasDragged) return;
    captureEnabled = !captureEnabled;
    // Instant UI update
    applyState();
    await saveCaptureState(captureEnabled);
  });

  window.addEventListener("resize", () => {
    if (
      togglePosition.y >
      document.documentElement.clientHeight - activeToggle.offsetHeight - 30
    ) {
      togglePosition.y =
        document.documentElement.clientHeight - activeToggle.offsetHeight - 30;
    }
    if (
      togglePosition.x >
      document.documentElement.clientWidth - activeToggle.offsetWidth - 30
    ) {
      togglePosition.x =
        document.documentElement.clientWidth - activeToggle.offsetWidth - 30;
    }
    updateTogglePosition();
  });

  window.addEventListener("keydown", async (e) => {
    if (e.key === "m" && (e.metaKey || e.ctrlKey)) {
      if (!globalEnabled) return;
      e.preventDefault();
      captureEnabled = !captureEnabled;
      // Instant UI update
      applyState();
      await saveCaptureState(captureEnabled);
    }
  });
}

let togglePosition = { x: 30, y: window.innerHeight - 80 };
let initialTogglePosition = { ...togglePosition };
let firstGrabOffset: { x: number; y: number } | null = null;
let isDragging = false;
let hasDragged = false;

requestAnimationFrame(() => {
  togglePosition.y =
    document.documentElement.clientHeight - activeToggle.offsetHeight - 30;
  updateTogglePosition();
});

function updateTogglePosition() {
  activeToggle.style.left = `${togglePosition.x}px`;
  activeToggle.style.top = `${togglePosition.y}px`;
}

activeToggle.addEventListener("mousedown", (e) => {
  isDragging = true;
  hasDragged = false;
  firstGrabOffset = {
    x: e.clientX - activeToggle.offsetLeft,
    y: e.clientY - activeToggle.offsetTop,
  };
  initialTogglePosition = { ...togglePosition };
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  togglePosition = {
    x: e.clientX - firstGrabOffset!.x,
    y: e.clientY - firstGrabOffset!.y,
  };

  const distance = Math.hypot(
    togglePosition.x - initialTogglePosition.x,
    togglePosition.y - initialTogglePosition.y,
  );
  if (distance < 5) return;

  hasDragged = true;

  updateTogglePosition();
});

window.addEventListener("mouseup", (e) => {
  isDragging = false;
});
