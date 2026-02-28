function initCapture() {
  console.log("Initializing capture...");
}
initCapture();
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "COMPLETION_RESULT") {
    console.log("Received suggestions:", msg.suggestions);
  }
});
