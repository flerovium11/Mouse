import { initCapture } from "./capture";

initCapture();

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg.type === "COMPLETION_RESULT") {
    // render suggestions in the UI
    console.log("Received suggestions:", msg.suggestions);
  }
});
