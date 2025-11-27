# JD Filter

Simple React + Node.js playground that grabs a fresh job post from the RemoteOK board and highlights the important parts (title, location, tech stacks, and platform) inside the UI.

## Prerequisites

- Node.js 20.19+ (matches the current React/Vite engine constraints)
- npm 10+

## Getting started

1. **Install dependencies**

   ```bash
   cd /Users/hiccup/Work/JD_Filter/server && npm install
   cd /Users/hiccup/Work/JD_Filter/client && npm install
   ```

2. **Run the API server**

   ```bash
   cd /Users/hiccup/Work/JD_Filter/server
   npm start
   ```

   The Express server starts on `http://localhost:4000` and exposes:

   - `GET /api/health` – quick health probe
   - `GET /api/job` – fetches data from the RemoteOK API, normalizes it, and returns `{ title, location, techStacks, jobPlatform, company, url }`.

3. **Run the React client**

   ```bash
   cd /Users/hiccup/Work/JD_Filter/client
   npm run dev
   ```

   Vite proxies `/api/*` requests to `http://localhost:4000`, so the React app can fetch the job descriptor without additional configuration. For deployments where the API lives elsewhere, create a `.env` file next to `client/package.json` and set:

   ```
   VITE_API_BASE_URL=https://your-api-host
   ```

## How it works

- The backend pulls the RemoteOK JSON feed, picks the first real job entry, and extracts the essential attributes.
- The React page calls `/api/job`, surfaces the key job details, and keeps the UI resilient with loading and error states plus a manual refresh button.

Feel free to swap the data source or enrich the parser—everything is kept intentionally small and hackable.


