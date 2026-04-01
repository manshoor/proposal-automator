# Upwork Proposal Automator

Chrome extension + Express.js backend that generates personalized Upwork proposals using AI.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Google Chrome

### Setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Start the backend:
   ```bash
   docker compose up --build
   ```

3. Load the Chrome extension:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` folder

4. Configure the extension:
   - Click the extension icon → Settings (gear icon)
   - Set your LLM provider (Anthropic or OpenAI)
   - Enter your API key
   - Backend URL defaults to `http://localhost:3002`

### Usage

1. Navigate to any Upwork job page
2. Click the extension icon
3. Review client vetting (location, spending, reviews)
4. Click "Generate Proposal"
5. Review the generated proposal
6. Click "Auto-fill" to populate Upwork's form
7. Review and submit manually

### Dashboard

Access the admin dashboard at `http://localhost:3001` to manage your profile, view proposal history, edit templates, and see analytics.
