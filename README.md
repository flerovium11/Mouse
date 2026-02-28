# Mouse

AI-powered smart autocomplete for any browser text field

## Getting started

1. Clone the repo
2. Go to `chrome://extensions`
3. Enable _Developer mode_
4. Click **Load unpacked** and select the repo root folder

## Running the Project

1. `npm install`
2. `npm run build` / `npm run dev` for development

### Debugging

Console output from content script is visible respective tab. Service worker can be inspected from `chrome://extensions`

## Extension Architecture

`src/background`: Service worker, a process that runs tab-independent, interacts with the db and ai models  
`src/content`: Runs in every tab, listens for DOM events & co, sends them to the service worker with `chrome.runtime.sendMessage` and then receives completion suggestions  
`src/popup`: UI for configuring settings that opens when users click our extension icon
