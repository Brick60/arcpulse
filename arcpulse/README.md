# ArcPulse Backend

Node.js monitoring service for CMR Fabrications — scans Reddit, Hacker News, Google Alerts, and industry RSS feeds, analyzes mentions with Claude AI, stores results in Firestore.

## Quick start

```bash
cp .env.example .env
# Fill in your credentials
npm install
npm run dev
```

## Endpoints

- `GET /` — health check
- `POST /scan/full` — run full scan (Reddit + web)
- `POST /scan/reddit` — Reddit only
- `POST /scan/web` — web/RSS/HN only
- `GET /mentions` — fetch stored mentions (filters: category, platform, urgent, hoursBack, limit)
- `GET /stats` — aggregated stats

## Deploy to Cloud Run

```bash
gcloud builds submit --config cloudbuild.yaml
```

See Phase 6 in the handoff doc for full GCP setup.
