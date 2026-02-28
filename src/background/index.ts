// Background service worker

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (msg.type) {
    case "DOM_EVENT":
      console.log(`Received DOM event from tab ${tabId}:`, msg.event);
    case "CONTEXT_UPDATE":
      console.log(`Received context update from tab ${tabId}:`, msg.context);
      break;
    case "REQUEST_COMPLETION":
      // get suggestions from agent and respond with results
      console.log(`Received completion request from tab ${tabId}:`, msg);
      break;
  }

  return true;
});

// Save tab data whenever a navigation completes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    console.log(`Tab ${tabId} navigated to ${tab.url}`);
  }
});
