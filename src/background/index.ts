// Background service worker

import {
  CompletionResultMessage,
  DOMAction,
  Message,
  MessageType,
  PageContext,
  RequestCompletionMessage,
} from "@shared/types";
import { register, dump, gen } from "@shared/mock-api";

console.info("Background service worker started");
chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});

const pageContexts = new Map<number, PageContext>();
const domActions: DOMAction[] = [];
let uuid: string | null = null;

async function getUuid(): Promise<string> {
  if (uuid) return uuid;
  const stored = await chrome.storage.local.get("uuid");
  if (stored["uuid"]) {
    uuid = stored["uuid"] as string;
    return uuid;
  }
  uuid = await register();
  await chrome.storage.local.set({ uuid });
  return uuid;
}

getUuid().catch(console.error);

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? -1;
  const frameId = sender.frameId ?? 0;

  switch (msg.type) {
    case MessageType.DOM_ACTION:
      domActions.push({ ...msg.action, tabId, frameId });
      if (domActions.length > 10) domActions.shift();
      break;
    case MessageType.PAGE_CONTEXT:
      pageContexts.set(tabId, { ...msg.pageContext, tabId, frameId });
      console.log("Received page context for tab", tabId, "frame", frameId);
      console.log(msg.pageContext.content);
      getUuid()
        .then((id) => dump(id, msg.pageContext))
        .catch(console.error);
      break;
    case MessageType.REQUEST_COMPLETION:
      console.log(
        "Received completion request:",
        msg.completionContext.element.surroundings,
      );
      handleCompletionRequest(msg, tabId, sendResponse);
      break;
  }

  return true;
});

async function handleCompletionRequest(
  msg: RequestCompletionMessage,
  tabId: number,
  sendResponse: (response: CompletionResultMessage) => void,
): Promise<void> {
  try {
    const id = await getUuid();
    const ctx = pageContexts.get(tabId) ?? {
      ...msg.completionContext,
      content: "",
    };
    const suggestions = await gen(id, ctx, msg.completionContext.element, [
      ...domActions,
    ]);
    sendResponse({ type: MessageType.COMPLETION_RESULT, suggestions });
  } catch (error) {
    console.error("Error handling completion request:", error);
    sendResponse({
      type: MessageType.COMPLETION_RESULT,
      error: (error as Error).message,
      suggestions: [],
    });
  }
}
