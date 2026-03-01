// Background service worker

import {
  CompletionResultMessage,
  DOMAction,
  Message,
  MessageType,
  RequestCompletionMessage,
} from "@shared/types";
import { getSuggestions } from "./agent";

console.info("Background service worker started");

// Will be cleared every time the service worker goes to sleep
const domActions: DOMAction[] = [];

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? -1;
  const frameId = sender.frameId ?? 0;

  switch (msg.type) {
    case MessageType.DOM_ACTION:
      console.log(`Received DOM action from tab ${tabId}:`, msg.action);
      domActions.push({ ...msg.action, tabId, frameId });
      if (domActions.length > 10) domActions.shift();
      break;
    case MessageType.PAGE_CONTEXT:
      console.log(`Received page context from tab ${tabId}:`, msg.pageContext);
      console.log(msg.pageContext.chunks.map((c) => c.content).join("\n---\n"));
      break;
    case MessageType.REQUEST_COMPLETION:
      // get suggestions from agent and respond with results
      console.log(`Received completion request from tab ${tabId}:`, msg);
      handleCompletionRequest(msg, sendResponse);
      break;
  }

  return true;
});

async function handleCompletionRequest(
  msg: RequestCompletionMessage,
  sendResponse: (response: CompletionResultMessage) => void,
): Promise<void> {
  try {
    const suggestions = await getSuggestions({
      ...msg.completionContext,
      recentActions: [...domActions],
    });
    const response: CompletionResultMessage = {
      type: MessageType.COMPLETION_RESULT,
      suggestions,
    };
    sendResponse(response);
  } catch (error) {
    console.error("Error handling completion request:", error);
    const response: CompletionResultMessage = {
      type: MessageType.COMPLETION_RESULT,
      error: (error as Error).message,
      suggestions: [],
    };
    sendResponse(response);
  }
}
