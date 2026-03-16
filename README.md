# Mouse

AI-powered smart autocomplete for any browser text field

## Getting started

1. Clone the repo
2. Go to `chrome://extensions`
3. Enable _Developer mode_
4. Click **Load unpacked** and select the repo root folder

## Running the Project

### Extension

1. `npm install`
2. `npm run build` / `npm run dev` for development

### Backend

The backend is built with FastAPI and uses Amazon Bedrock (Nova for generation + Titan for embeddings).

1. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Create a `.env` file with your configuration:

   ```env
   AWS_ACCESS_KEY_ID=your_access_key_id
   AWS_SECRET_ACCESS_KEY=your_secret_access_key
   AWS_REGION=us-east-1

   # Optional overrides
   BEDROCK_GENERATION_MODEL=amazon.nova-lite-v1:0
   BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
   BEDROCK_EMBEDDING_DIM=1024

   AUTH_TOKEN=your_secure_auth_token_here
   ```

3. Start the development server:
   ```bash
   fastapi run backend/server.py
   ```

### Debugging

Console output from content script is visible respective tab. Service worker can be inspected from `chrome://extensions`

## Extension Architecture

`src/background`: Service worker, a process that runs tab-independent, interacts with the db and ai models  
`src/content`: Runs in every tab, listens for DOM events & co, sends them to the service worker with `chrome.runtime.sendMessage` and then receives completion suggestions  
`src/popup`: UI for configuring settings that opens when users click our extension icon

Extension is built with Vite: background and popup are compiled as ES modules, while content has a separate build config (`vite.content.config.ts`) and uses an IIFE bundle, because content scripts cannot use ES module imports. `npm run dev` runs two `vite build --watch` commands concurrently, so the output is a bit messy.
