# ArcPulse — Claude Context File

**Owner:** Fred Rogers (fred@brick60.com) · GitHub: Brick60  
**GCP project:** `arcpulse` (project number: `304203583577`)  
**Live URLs:** backend → `https://arcpulse-304203583577.us-central1.run.app` · dashboard → `https://arcpulse.web.app`

---

## What This Is

ArcPulse is a **brand and competitor monitoring tool** for CMR Fabrications — a niche manufacturer of carbon fiber pancake welding hoods for pipeline welders. It continuously scans the web, Reddit, and welding industry publications for mentions of the brand, competitors, and relevant keywords, runs each mention through Claude AI for analysis, stores results in Firestore, and surfaces them on a private React dashboard.

**Critical rule: this tool only monitors. No automated replies are ever posted. The operator (Fred) reads the AI-drafted replies and posts them manually.**

There is exactly one user of the dashboard: `fred@brick60.com`.

---

## Monitoring Targets

| Type | Values |
|---|---|
| Brand | CMR Fabrications |
| Competitors | Pipeliners Cloud, Outlaw Leather, Weldlife |
| Keywords | welding hood, pancake hood, pipeline hood, carbon fiber hood, pipeliner hood |

These are configured as Cloud Run environment variables (`BRAND_NAMES`, `COMPETITOR_NAMES`, `KEYWORDS`) and baked into `arcpulse/cloudbuild.yaml` so they survive every redeploy.

---

## Tech Stack

### Backend (`arcpulse/`)
- **Runtime:** Node.js 20 (Docker, Cloud Run)
- **Framework:** Express 4
- **AI:** Anthropic SDK — `claude-haiku-4-5-20251001`
- **Database:** Firestore (GCP, `(default)` database, `mentions` collection)
- **Auth validation:** Firebase Admin SDK (`admin.auth().verifyIdToken()`)
- **Secrets:** GCP Secret Manager (production) / `.env` file (local)
- **Logging:** Winston (console transport only — Cloud Logging picks it up)
- **HTTP scraping:** Axios + fast-xml-parser
- **Reddit (authenticated):** Snoowrap — built but inactive, awaiting API approval
- **Deployment:** Cloud Build → Docker → Cloud Run

### Frontend (`arcpulse-dashboard/`)
- **Framework:** React 18 (Create React App)
- **Auth:** Firebase JS SDK v12 — Google Sign-In
- **Charts:** Recharts
- **Hosting:** Firebase Hosting (`arcpulse.web.app`)
- **API calls:** direct browser → Cloud Run fetch with Firebase ID token

---

## Architecture

```
Cloud Scheduler (GCP)
  /scan/web   — every 15 min
  /scan/reddit — every 15 min (currently skipped — no Reddit API key yet)
        │
        │ POST (no auth — scheduler SA has no special role, Cloud Run is public)
        ▼
Cloud Run — arcpulse backend (Node.js / Express)
        │
        ├── WebScraper     → Google News RSS, Reddit public JSON, industry RSS, HN Algolia, Google Alerts
        ├── RedditScraper  → Snoowrap (inactive — awaiting API approval)
        ├── AIAnalyzer     → Claude Haiku (batch, retry-on-429, 1.5s inter-batch delay)
        ├── FirestoreDB    → save/deduplicate mentions
        └── Notifier       → Slack webhook for urgency ≥ 8 (not yet configured)
        │
        ▼
Firestore — collection: mentions
        │
        │ REST (browser fetches Cloud Run directly with Firebase ID token)
        ▼
Firebase Hosting — React dashboard (arcpulse.web.app)
  Auth: Firebase Google Sign-In → getIdToken() → Bearer header → requireAuth middleware
```

### Auth architecture (important — non-obvious)

Cloud Run is **publicly accessible** (IAM `roles/run.invoker` granted to `allUsers`). This was necessary because:
1. Cloud Run's IAM layer rejects OPTIONS preflight requests before Express can respond with CORS headers.
2. Firebase Hosting rewrites do not inject identity tokens into forwarded requests.

Instead, token auth happens **inside Express**: the `requireAuth` middleware calls `admin.auth().verifyIdToken(token)` on the Firebase ID token sent in the `Authorization: Bearer` header from the browser.

The GCP org policy `constraints/iam.allowedPolicyMemberDomains` required an override at the **org level** (org ID: `11182513510`) to allow `allUsers` — a project-level override alone is insufficient due to GCP's intersection semantics.

Scan endpoints (`/scan/web`, `/scan/reddit`, `/scan/full`) are **intentionally unauthenticated** — called by Cloud Scheduler.

---

## Repository Structure

```
arcpulse/                          ← repo root
├── CLAUDE.md                      ← this file
├── ARCPULSE_PROJECT_BRIEF.md      ← human-readable project overview
├── ArcPulse-Reddit-API-Request.pdf ← Reddit API application (filed, pending approval)
├── .gitignore
│
├── arcpulse/                      ← Node.js backend (deploys to Cloud Run)
│   ├── src/
│   │   ├── index.js               ← Express app, route definitions, requireAuth middleware
│   │   ├── config.js              ← Secret Manager (prod) or .env (local) config loader
│   │   ├── logger.js              ← Winston logger singleton
│   │   ├── ai/
│   │   │   └── analyzer.js        ← Claude Haiku batch analyzer, retry, JSON parse
│   │   ├── db/
│   │   │   └── firestore.js       ← saveMentions (dedup), getMentions (in-memory filter), getStats
│   │   ├── scrapers/
│   │   │   ├── web.js             ← Google News, Reddit public JSON, industry RSS, HN, Google Alerts
│   │   │   └── reddit.js          ← Snoowrap authenticated scraper (inactive — no API key)
│   │   └── scheduler/
│   │       ├── scanner.js         ← orchestrates scrape → AI → save → notify pipeline
│   │       └── notifier.js        ← Slack webhook for urgent mentions
│   ├── Dockerfile
│   ├── cloudbuild.yaml            ← Cloud Build → Docker → Cloud Run deploy pipeline
│   ├── setup-schedulers.sh        ← one-time script to create Cloud Scheduler jobs
│   ├── package.json
│   ├── .env                       ← local dev secrets (gitignored)
│   └── .env.example               ← template for local setup
│
└── arcpulse-dashboard/            ← React frontend (deploys to Firebase Hosting)
    ├── src/
    │   ├── index.js               ← React entry point
    │   ├── App.js                 ← full dashboard UI (one large component file)
    │   ├── App.css                ← dark-theme CSS variables and all styles
    │   ├── firebase.js            ← Firebase init, signInWithGoogle, signOutUser, onAuth
    │   └── lib/
    │       └── api.js             ← API client (fetches Cloud Run with Firebase ID token)
    ├── public/
    │   └── index.html
    ├── functions/
    │   └── index.js               ← abandoned Firebase Functions proxy (not in use — see below)
    ├── firebase.json              ← Firebase Hosting config (rewrites reference Functions — not in use)
    ├── package.json
    ├── .env                       ← local env (gitignored, contains REACT_APP_API_URL)
    └── .env.example
```

### Stray root-level files (ignore)
`App.js`, `App.css`, `api.js`, and `apify.js` at the repo root are leftover draft files from an earlier scaffolding pass. They are not used anywhere. The live source files are in `arcpulse-dashboard/src/`.

### Abandoned Firebase Functions proxy
`arcpulse-dashboard/functions/index.js` is a Cloud Functions proxy that was built as an alternative auth approach (Functions SA → Cloud Run OIDC token). It was abandoned when the simpler approach (public Cloud Run + Firebase ID token validation in Express) solved the CORS auth problem. `firebase.json` still references it but the direct browser → Cloud Run approach bypasses all of this. The Functions code is harmless but unused.

---

## Scan Pipeline

Every scan follows this chain in `scanner.js`:

```
1. Scrape  → WebScraper.runFullScan() and/or RedditScraper.runFullScan()
2. Filter  → drop items with no sourceId or no title/body
3. Analyze → AIAnalyzer.analyzeBatch() — Claude Haiku, 10 items/batch, 1.5s delay between batches
4. Filter  → drop items where ai.category === 'irrelevant'
5. Save    → FirestoreDB.saveMentions() — deduplication by sourceId
6. Notify  → Notifier.notifyUrgent() — Slack for urgencyScore ≥ 8
```

---

## AI Analysis

**Model:** `claude-haiku-4-5-20251001`  
**Rate limit:** 50 req/min on current Anthropic plan. Handled with 1.5s delay between batches of 10.  
**Retry:** 2 retries on HTTP 429 with 3s backoff.  
**Fallback on error:** marks as `irrelevant` (not `unknown`) so junk doesn't accumulate in Firestore.  
**JSON parsing:** uses regex `text.match(/\{[\s\S]*\}/)` to extract JSON from the response — handles markdown fences and trailing text.

**Categories:**
- `defend` — our brand mentioned, operator should respond
- `engage` — relevant welding conversation to join for visibility
- `competitor` — competitor being discussed
- `irrelevant` — not relevant, filtered out and not saved

**Fields per mention saved to Firestore:** `category`, `sentiment`, `urgencyScore` (1–10), `valueScore` (1–10), `urgent` (boolean, true if score ≥ 8), `actionNeeded`, `summary`, `draftReply`, `insight`, plus all raw scraper fields (`title`, `body`, `author`, `url`, `platform`, `subreddit`, `source`, `createdAt`, `sourceId`, `savedAt`).

---

## Firestore

**Collection:** `mentions`  
**Document ID:** `sourceId` (e.g. `reddit_abc123`, `gnews_xyz`, `hn_99999`, `alert_abc`)  
**Deduplication:** before saving, fetches existing docs for each `sourceId`. Skips if existing doc has `category` set and it's not `'unknown'`. Re-saves if category is `'unknown'` (allows fixing broken earlier scans).

**Query pattern in `getMentions`:** only filters by `savedAt >= since` in Firestore (avoids composite index requirement), then filters `category`, `platform`, `urgent` in memory, then sorts by `urgencyScore` descending in memory. This is intentional — adding a Firestore composite index would require `orderBy` on two fields simultaneously, which Firestore requires an explicit index for.

---

## Web Scraping Sources

| Source | Method | Notes |
|---|---|---|
| Google News | RSS: `https://news.google.com/rss/search?q={term}` | 10 results per term, free, no API key |
| Reddit (public) | JSON: `https://reddit.com/r/{sub}/new.json?limit=25` | 7 welding subreddits, 1s delay between subs |
| Industry RSS | Hardcoded feeds in `web.js` | The Fabricator, Welding Journal, AWS News, Welding Productivity, Lincoln Electric |
| Hacker News | Algolia API: `https://hn.algolia.com/api/v1/search_by_date` | Stories only (`tags: 'story'`), 5 per term, 7-day lookback |
| Google Alerts | RSS feeds from google.com/alerts | Not yet configured — needs `GOOGLE_ALERTS_RSS_URLS` env var |
| Reddit (auth) | Snoowrap (`reddit.js`) | Built and ready — awaiting Reddit API approval |

All sources run in parallel via `Promise.all()` in `runFullScan()`.

---

## Environment Variables

### Production (set in `cloudbuild.yaml`, survive every redeploy)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `GCP_PROJECT_ID` | `arcpulse` |
| `BRAND_NAMES` | `CMR Fabrications` |
| `COMPETITOR_NAMES` | `Pipeliners Cloud,Outlaw Leather,Weldlife` |
| `KEYWORDS` | `welding hood,pancake hood,pipeline hood,carbon fiber hood,pipeliner hood` |

**Note on `cloudbuild.yaml` delimiter:** The `--set-env-vars` flag uses `^@^` as a custom delimiter (instead of comma) because competitor/keyword values contain commas. This is a Cloud Build / gcloud convention: `--set-env-vars=^@^KEY1=val1@KEY2=val2`.

### Secrets (GCP Secret Manager, loaded at startup in production)

| Secret name | Status |
|---|---|
| `ANTHROPIC_API_KEY` | ✅ Set — $10 credit added April 2026 |
| `REDDIT_CLIENT_ID` | ⏳ Placeholder — awaiting API approval |
| `REDDIT_CLIENT_SECRET` | ⏳ Placeholder |
| `REDDIT_USER_AGENT` | ⏳ Placeholder |
| `SLACK_WEBHOOK_URL` | ⏳ Not configured |

### Optional env vars (not yet set)

| Variable | Purpose |
|---|---|
| `GOOGLE_ALERTS_RSS_URLS` | Comma-separated RSS URLs from google.com/alerts |
| `INDUSTRY_RSS_FEEDS` | JSON array: `[{"url":"...","name":"..."}]` for custom RSS feeds |

### Local development (`arcpulse/.env`, gitignored)

Copy `arcpulse/.env.example` and fill in values. `config.js` detects `NODE_ENV !== 'production'` and uses `dotenv` instead of Secret Manager.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | None | Health check |
| GET | `/stats?hoursBack=24` | Firebase ID token | Aggregate stats |
| GET | `/mentions?hoursBack=24&limit=100&category=defend` | Firebase ID token | Filtered mention list |
| POST | `/scan/full` | None | Full scan (web + reddit) |
| POST | `/scan/web` | None | Web-only scan |
| POST | `/scan/reddit` | None | Reddit-only scan |

The dashboard calls `/stats` and `/mentions` with `Authorization: Bearer <firebase-id-token>`. Scan endpoints require no auth — they are called by Cloud Scheduler.

---

## Dashboard

Single-page React app (`App.js`). All UI in one file — no router, no Redux, no component library.

**Auth flow:** `onAuthStateChanged` → if no user, show `LoginScreen` → `signInWithGoogle()` → Firebase popup → on success, `loadData()` fetches stats + mentions from Cloud Run.

**Tabs:** Brand defense (category: `defend`), Visibility opps (`engage`), Competitor intel (`competitor`)

**Sidebar controls:** platform filter, time range (6h / 24h / 48h / 168h), scan trigger buttons, user profile + logout

**Mention card:** title, body, AI insight, AI draft reply with Copy/Open thread/Edit with AI buttons. Urgent mentions get a red left border and URGENT badge.

**Edit with AI modal:** opens when user clicks "Edit with AI" on a mention card. Currently the tone buttons are UI-only stubs — they don't call the API yet.

**Sparkline chart:** currently renders random mock data (real time-series data not yet implemented in the backend).

**Demo data:** `DEMO_STATS` and `DEMO_MENTIONS` are exported from `api.js` for development reference. They are **not** shown in the running app — the app starts with empty state and loads live data.

---

## GCP Infrastructure

| Resource | Details |
|---|---|
| GCP Project | `arcpulse` |
| Cloud Run service | `arcpulse`, us-central1, public, 512Mi RAM, 1 CPU, timeout 540s |
| Firestore | `(default)` database |
| Firebase Hosting | `arcpulse.web.app` + `arcpulse.firebaseapp.com` |
| Firebase Auth | Google Sign-In, restricted to `fred@brick60.com` in app logic (not Firebase Rules) |
| Artifact Registry | `us-central1-docker.pkg.dev/arcpulse/arcpulse/arcpulse` |
| Cloud Build | Manual trigger: `gcloud builds submit` |
| Cloud Scheduler | `arcpulse-web` (every 15 min) · `arcpulse-reddit` (every 15 min) |
| Service account (Cloud Run identity) | `304203583577-compute@developer.gserviceaccount.com` |
| Scheduler SA | `arcpulse-scheduler@arcpulse.iam.gserviceaccount.com` |
| Org policy override | `constraints/iam.allowedPolicyMemberDomains` → ALLOW_ALL at org level (org `11182513510`) |

---

## Deploy Commands

**Backend (Cloud Run):**
```bash
cd arcpulse
gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=latest --project=arcpulse
```

**Frontend (Firebase Hosting):**
```bash
cd arcpulse-dashboard
npm run build
firebase deploy --only hosting
```

If gcloud or Firebase CLI token is expired, run `gcloud auth login` or `firebase login --reauth` before deploying.

---

## Known Gotchas

- **Composite index:** `getMentions` intentionally avoids multi-field `orderBy` in Firestore to sidestep the composite index requirement. Any query refactor that adds `orderBy('urgencyScore')` to the Firestore query will throw an error until you create the index in the Firebase console.

- **`--set-env-vars` comma parsing:** The `^@^` custom delimiter in `cloudbuild.yaml` is load-bearing. If you change this line, don't accidentally switch back to comma-separated — competitor names contain commas.

- **Cloud Run cold start:** With `--min-instances=0`, the first request after the service idles takes 2–3 seconds. This can cause the scheduler's first request of a cycle to appear slow. Set `--min-instances=1` in `cloudbuild.yaml` to eliminate this if needed.

- **Reddit scraper (Snoowrap) is inactive:** `reddit.js` requires `REDDIT_CLIENT_ID` to be set or it returns early with an empty array. The web scraper covers Reddit via public JSON in the meantime. Once API credentials arrive, add them to Secret Manager and both scrapers will run in parallel.

- **Anthropic rate limit:** Current plan is 50 req/min. The 10-item batch + 1.5s inter-batch delay stays safely under this. If Reddit authenticated scraping activates and volume grows significantly, upgrade the Anthropic tier.

- **`firebase.json` rewrites:** The hosting config still references a Cloud Functions proxy (`functions/index.js`). This is unused — the dashboard calls Cloud Run directly. The `**` → `index.html` rewrite at the bottom is the only active one (SPA routing).

---

## Pending Next Steps

1. **Reddit API** — once approved, add `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` to GCP Secret Manager. The Snoowrap scraper is fully built and will activate automatically.
2. **Google Alerts** — set up alerts at google.com/alerts for brand/competitor/keyword terms → add RSS URLs to Cloud Run env var `GOOGLE_ALERTS_RSS_URLS`.
3. **Slack** — create incoming webhook in Slack workspace → add to Secret Manager as `SLACK_WEBHOOK_URL`. Urgency ≥ 8 mentions will notify automatically.
4. **GitHub Actions CI** — replace manual `gcloud builds submit` with auto-deploy on `git push main`.
5. **Sparkline chart** — currently shows random data. Backend could return hourly mention counts from Firestore to make this real.
6. **"Edit with AI" modal** — tone buttons are UI stubs. Could call Claude to refine the draft reply in real time.
