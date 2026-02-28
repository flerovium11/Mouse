chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  var _a;
  const tabId = (_a = sender.tab) == null ? void 0 : _a.id;
  switch (msg.type) {
    case "DOM_EVENT":
      console.log(`Received DOM event from tab ${tabId}:`, msg.event);
    case "CONTEXT_UPDATE":
      console.log(`Received context update from tab ${tabId}:`, msg.context);
      break;
    case "REQUEST_COMPLETION":
      console.log(`Received completion request from tab ${tabId}:`, msg);
      break;
  }
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    console.log(`Tab ${tabId} navigated to ${tab.url}`);
  }
});
