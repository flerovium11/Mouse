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

const modifierKeyPrefix =
  navigator.platform.startsWith("Mac") || navigator.platform === "iPhone"
    ? "⌘"
    : "Ctrl";
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

async function loadCaptureState(): Promise<boolean> {
  const tabId = await getTabId();
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return result[STORAGE_KEY]?.[tabId] ?? true;
}

async function saveCaptureState(enabled: boolean): Promise<void> {
  const tabId = await getTabId();
  const result = await chrome.storage.session.get(STORAGE_KEY);

  const updated = {
    ...(result[STORAGE_KEY] || {}),
    [tabId]: enabled,
  };

  await chrome.storage.session.set({
    [STORAGE_KEY]: updated,
  });
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

function setCaptureEnabled(enabled: boolean, animate: boolean = true): void {
  captureEnabled = enabled;

  if (blinkTimeout) {
    clearTimeout(blinkTimeout);
    blinkTimeout = null;
  }

  if (enabled) {
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
  const enabled = await loadCaptureState();
  setCaptureEnabled(enabled, false);

  activeToggle.addEventListener("click", async () => {
    if (hasDragged) return;
    const newEnabled = !captureEnabled;
    setCaptureEnabled(newEnabled);
    saveCaptureState(newEnabled);
  });

  window.addEventListener("resize", () => {
    if (
      togglePosition.y >
      document.documentElement.clientHeight - activeToggle.offsetHeight - 30
    ) {
      togglePosition.y =
        document.documentElement.clientHeight - activeToggle.offsetHeight - 30;
      updateTogglePosition();
    } else if (
      togglePosition.x >
      document.documentElement.clientWidth - activeToggle.offsetWidth - 30
    ) {
      togglePosition.x =
        document.documentElement.clientWidth - activeToggle.offsetWidth - 30;
      updateTogglePosition();
    }

    if (
      togglePosition.x >
      document.documentElement.clientWidth - activeToggle.offsetWidth - 30
    ) {
      togglePosition.x =
        document.documentElement.clientWidth - activeToggle.offsetWidth - 30;
      updateTogglePosition();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "m" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const newEnabled = !captureEnabled;
      setCaptureEnabled(newEnabled);
      saveCaptureState(newEnabled);
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
