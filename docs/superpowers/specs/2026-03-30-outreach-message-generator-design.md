# Outreach Message Generator — MVP Design Spec

## Overview

Chrome extension (Manifest V3) + Express.js backend that generates personalized outreach messages using an LLM. User pastes a profile (LinkedIn/Upwork/Fiverr/PeoplePerHour), provides a company URL, and receives 3 tailored messages.

## User Workflow

1. Open Chrome extension popup
2. Paste target profile text into textarea
3. Enter company website URL
4. (Optional) Add custom instruction
5. Click "Generate"
6. Receive 3 personalized messages with copy buttons

## Architecture

**Monorepo with two packages:**

```
chromePlugin/
├── docker-compose.yml
├── .env.example
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── options.html
│   ├── options.js
│   └── icons/ (16, 48, 128px)
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── server.js
│   ├── api/
│   │   └── generate-message.js
│   ├── lib/
│   │   ├── scraper.js
│   │   └── llm.js
│   ├── prompts/
│   │   └── outreach.js
│   └── vercel.json
└── README.md
```

## Chrome Extension (Manifest V3)

### manifest.json
- `manifest_version: 3`
- `permissions: ["storage"]`
- `action.default_popup: "popup.html"`
- `options_page: "options.html"`

### popup.html / popup.js
- **Form inputs:**
  - Textarea: profile text (required)
  - Input: company website URL (required)
  - Textarea: optional instruction
  - Button: "Generate Messages"
- **Results area:**
  - 3 message cards, each showing subject + body
  - "Copy" button per message (uses `navigator.clipboard.writeText`)
- **Loading state:** spinner/disabled button while awaiting response
- **Error display:** inline error messages for failures

### options.html / options.js
- **Settings:**
  - Dropdown: LLM provider (Anthropic / OpenAI)
  - Input: API key (password field)
  - Input: Backend URL (defaults to deployed URL, editable for local dev)
- **Storage:** `chrome.storage.sync` for cross-device persistence
- **Validation:** check that API key is present before allowing generation

### Styling
- Vanilla CSS, no framework
- Popup width: ~400px
- Clean, minimal design. Light theme.

### No build step
- Plain HTML/JS/CSS. Load as unpacked extension in Chrome.

## Backend (Express.js)

### POST /generate-message

**Request:**
```json
{
  "profileText": "string (required)",
  "companyUrl": "string (required, valid URL)",
  "instruction": "string (optional)",
  "provider": "anthropic | openai (required)",
  "apiKey": "string (required)"
}
```

**Response (200):**
```json
{
  "messages": [
    { "id": 1, "subject": "string", "body": "string" },
    { "id": 2, "subject": "string", "body": "string" },
    { "id": 3, "subject": "string", "body": "string" }
  ]
}
```

**Error Response (4xx/5xx):**
```json
{
  "error": "Human-readable error message"
}
```

### Request Flow
1. Validate inputs (profileText, companyUrl, provider, apiKey required)
2. Fetch company URL homepage with `node-fetch` (5s timeout)
3. Parse HTML with `cheerio` — strip nav, footer, scripts, styles; extract main text content (truncate to ~2000 chars)
4. Build LLM prompt from profile text + company text + optional instruction
5. Call selected LLM provider
6. Parse structured JSON response
7. Return 3 messages

### lib/scraper.js
- `fetchCompanyInfo(url)` -> `string`
- Uses `node-fetch` with User-Agent header
- `cheerio` to parse HTML, extract text from `<main>`, `<article>`, or `<body>`
- Strips boilerplate (nav, footer, sidebar, script, style tags)
- Truncates to 2000 characters

### lib/llm.js
- `generateMessages({ profileText, companyInfo, instruction, provider, apiKey })` -> `{ messages: [...] }`
- Provider switch:
  - `anthropic`: uses `@anthropic-ai/sdk`, `claude-sonnet-4-20250514` model
  - `openai`: uses `openai` SDK, `gpt-4o` model
- Both request JSON structured output
- System prompt imported from `prompts/outreach.js`

### prompts/outreach.js
- Exports the system prompt template
- Single file to edit for prompt tuning
- Default prompt generates 3 message styles:
  1. Direct value proposition
  2. Common ground / shared interests
  3. Question-based opener
- Each message: subject (< 60 chars) + body (150-250 words)
- Professional but conversational tone
- Adapts to context (cold outreach vs freelancer proposals) based on profile source

### CORS
- `cors` middleware allowing all origins (MVP simplicity)

### Dependencies
- `express`, `cors`
- `node-fetch`, `cheerio`
- `@anthropic-ai/sdk`
- `openai`
- `nodemon` (dev dependency, for hot-reload in Docker)

## Docker Setup

### docker-compose.yml
- Single service: `backend`
- Builds from `backend/Dockerfile`
- Maps port 3000
- Mounts `backend/` as volume for hot-reload
- Uses `nodemon` for auto-restart on file changes
- Reads `.env` file

### backend/Dockerfile
- Base: `node:20-alpine`
- Working dir: `/app`
- Install dependencies, copy source
- Expose port 3000
- Dev command: `npx nodemon server.js`

### .env.example
```
PORT=3000
```

## API Key Security

- API keys are stored in the user's browser via `chrome.storage.sync`
- Keys are sent per-request to the backend in the request body
- Backend does NOT store or log API keys
- Backend is stateless — no database, no sessions

## Deployment

### Backend
- **Vercel:** `vercel.json` routes `/api/*` to serverless functions
- **Alternative:** Any Docker host (Railway, Render, Fly.io)
- No environment secrets needed on server (keys come from client)

### Extension
- Load unpacked in Chrome for development
- Package as `.zip` for Chrome Web Store submission

## What Is NOT Included (MVP boundaries)

- No authentication/login system
- No database
- No LinkedIn/Upwork scraping or automation
- No bulk processing
- No message history or saving
- No complex UI framework
- No browser content script injection

## Verification Plan

1. **Backend:** `docker compose up`, then `curl -X POST http://localhost:3000/api/generate-message` with test payload — verify 3 messages returned
2. **Extension:** Load unpacked in Chrome, open popup, paste test profile, enter URL, generate — verify messages display and copy works
3. **Both providers:** Test with both Anthropic and OpenAI API keys
4. **Error cases:** Invalid URL, missing API key, network failure — verify clear error messages
