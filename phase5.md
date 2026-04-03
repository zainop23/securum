# Phase 5 — React Dashboard *(Rahul)*

> **Owner:** Rahul  
> **Effort estimate:** 3 days  
> **Depends on:** Phase 4 (Zain's commit-reveal orchestration and synchronous `POST /query`)  
> **Milestone:** Analyst can log in, submit a query, see results, and view history — all in the browser with a stunning UI.

---

## Overview

The backend is fully functional. `POST /query` runs the commit–reveal orchestration and returns results synchronously (with a 60-second timeout). The dashboard needs to call the API and display the results using a dynamic, premium, and beautiful UI.

**CRITICAL REQUIREMENT:** The UI should NOT look like a generic MVP. The dashboard must use modern web design best practices — vibrant color palettes, glassmorphism, micro-animations, sleek typography (e.g. Inter or Roboto via Google Fonts), and responsive hover states. An aesthetic and smooth user experience is just as important as functional correctness.

---

## Prerequisites

Before starting, confirm the following are ready:

- [ ] Coordinator `POST /query` runs synchronously and returns `{ status: "done", result: ... }`.
- [ ] Coordinator `GET /results/:queryId` returns historical query results.
- [ ] Coordinator `GET /results` and `GET /orgs` are available.
- [ ] The `dashboard.Dockerfile` and `docker-compose.yml` entries for the dashboard are correctly pointing to port 3000.
- [ ] Ensure Coordinator CORS is configured to accept requests from `http://localhost:3000`.

---

## Task Breakdown

### Task 1 — Project Scaffold & Setup

**Where:** `packages/dashboard/`

1. **Initialize Vite + React App:**
   - From `packages/dashboard/`, initialize the Vite React TS app:
     ```bash
     npx -y create-vite@latest . --template react-ts
     ```
2. **Install Dependencies:**
   - Core: `npm install react-router-dom axios recharts`
   - UI styling: `npm install -D tailwindcss postcss autoprefixer @tailwindcss/forms`
3. **Configure Tailwind:**
   - Run `npx tailwindcss init -p`
   - Update `tailwind.config.js` with content paths (`"./index.html", "./src/**/*.{js,ts,jsx,tsx}"`).
   - Add modern dark/light mode themes and custom color palettes in the config.
4. **Create Axios Instance:**
   - Create `src/api/client.ts`.
   - Set base URL from `import.meta.env.VITE_API_URL` (default `http://localhost:4000`).
   - **Important:** Set `timeout: 60000` on the axios instance. The synchronous commit–reveal pipeline takes several seconds.
   - Attach JWT using a request interceptor.

### Task 2 — Aesthetic Design System & Global CSS

**Where:** `src/index.css` and `src/components/`

- Create a `Layout` component with a Sidebar or Top Navbar.
- Use a sleek dark mode or a clean glassmorphism light interface.
- Add Google Fonts via `index.html` (e.g., `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`).
- Define utility classes for subtle animations (e.g., fade-in, slide-up) and interactive hover/focus states to make the interface feel responsive and alive.

### Task 3 — Auth Context & Routing

**Where:** `src/context/AuthContext.tsx` and `src/App.tsx`

1. **State Management:**
   - Store JWT in `localStorage`.
   - Create `AuthContext` to expose `token`, `login(token)`, and `logout()`.
2. **Setup React Router:**
   - Routes:
     - `/login`
     - `/` (Home/Overview)
     - `/query` (Query Builder)
     - `/results/:id` (Single Result)
     - `/history` (All queries history)
   - Wrap protected routes so unauthenticated users are redirected to `/login`.

### Task 4 — Core Views Implementation

#### A. Login Page (`/login`)
- Clean, centered login card with username and password.
- Call `POST /auth/login`. Store JWT on success, show red alert on failure.

#### B. Home Overview (`/`)
- Display large, premium "Metric Cards" showing:
  - Total Organizations connected (fetch from `GET /orgs`).
  - Total Queries run.
- Display a sleek "Recent Queries" list showing the last 5 queries.

#### C. Query Builder (`/query`)
- Build a form utilizing `@tailwindcss/forms` styling.
- Fields:
  - **Aggregate:** Select (COUNT, SUM, AVG)
  - **Column:** Text input (or select for `amount`)
  - **Table:** Select (hardcoded to `transactions` for demo)
  - **GroupBy:** Optional text input (e.g. `category`)
- **Epsilon Slider:**
  - Range from 0.1 to 10.0 (Step 0.1, Default 1.0).
  - Include a styled tooltip or label: *"Lower = more private, less accurate"*.
- **Submit Action:**
  - On click, block the button, show an engaging loading spinner or pulsating animation, and execute `POST /query`.
  - On success, redirect to `/results/:queryId`.
  - On failure, show an elegant error notification.

#### D. Results Display (`/results/:id`)
- Fetch data using `GET /results/:id`.
- **States:**
  - `status === 'pending'`: Show loading animation.
  - `status === 'failed'`: Show an error banner/card reading the failure reason.
  - `status === 'done'`: 
    - If `scalar` result: Display a massive, beautifully styled "Stat Card" for the final value.
    - If `grouped` result: Render a `Recharts` BarChart. Use custom colors, tooltips, and grid lines to match your chosen aesthetic. Render a sleek data table below the chart.
- Include a "Run Another Query" action button.

#### E. History Page (`/history`)
- Fetch `GET /results`.
- Display a polished data table with Query ID, Aggregate Type, Status Badges (Green for done, Red for failed), Timestamp, and an action link to view the details.

---

## Gotchas & Pitfalls

### 1. Vite Proxy & Axios Timeouts
By default, browser requests or proxies may timeout at 30s. Since phase 4 does everything synchronously, queries take a few seconds but can push higher if org-nodes are delayed. **Ensure Axios has `timeout: 60000`.**

### 2. CORS Blocking Requests
If you run `npm run dev` for the dashboard (`localhost:5173`) and connect to the coordinator (`localhost:4000`), CORS errors will block everything unless the coordinator is explicitly allowing requests. Verify `app.use(cors())` is on the backend.

### 3. Missing `recharts` Responsive Container
Charts in Recharts need a width/height parent context. Wrap them in `<ResponsiveContainer width="100%" height={400}>` otherwise they won't render or will collapse.

---

## Verification & Testing Guide

Once built, verify the flow entirely from the browser:

1. Open `http://localhost:3000` (or `5173` via local dev).
2. Login with `analyst` / `analyst123`.
3. Check Home for Organization count (should show 3 if Phase 1/4 were seeded properly).
4. Run: **SUM of amount GROUP BY category (Epsilon 1.0)**.
   - Verify the submit button locks and loading indicator looks good.
   - Verify it navigates to Results.
   - Verify a Recharts bar chart appears showing the categories.
5. Check History to verify the query was logged.
6. Verify UI aesthetics — no unstyled native HTML elements, inputs should glow on focus, buttons should react on hover.
