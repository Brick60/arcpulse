# Brand Monitor — Setup Guide

Full-stack brand & competitor monitoring service.  
Runs on Google Cloud Run, triggered by Cloud Scheduler.

## What it monitors

| Source | Frequency | Method |
|---|---|---|
| Reddit | Every 15 min | Official Reddit API (free) |
| Twitter/X | Every 30 min | Official API v2 ($100/mo) |
| Facebook | Twice daily | Apify actor (~$15-40/mo) |
| Instagram | Twice daily | Apify actor (~$15-30/mo) |
| TikTok | Twice daily | Apify actor (~$15-30/mo) |
| Hacker News | Hourly | Algolia API (free) |
| Google Alerts | Near real-time | RSS feed (free) |
| Blogs / RSS | Hourly | RSS parsing (free) |
| Product Hunt | Hourly | RSS feed (free) |

## Prerequisites

- Google Cloud project with billing enabled
- Node.js 20+
- `gcloud` CLI installed and authenticated

---

## Step 1 — Get your API keys

### Reddit (free)
1. Go to https://www.reddit.com/prefs/apps
2. Click "create another app" → choose "script"
3. Copy `client_id` (under app name) and `client_secret`

### Apify (for Facebook, Instagram, TikTok)
1. Sign up at https://apify.com
2. Go to Account → Integrations → copy your API token
3. Social scrapes cost ~$0.25–1 per run depending on volume

### Twitter/X Basic API ($100/month)
1. Apply at https://developer.twitter.com/en/portal/petition/essential/basic-info
2. Create a project and app
3. Copy Bearer Token (for search) + all four OAuth keys (for posting)

### Anthropic (AI analysis)
1. Get key at https://console.anthropic.com
2. Analysis uses claude-haiku (fast + cheap — ~$0.25 per 1M tokens)

### Google Alerts RSS
1. Go to https://www.google.com/alerts
2. Create an alert for each brand/competitor
3. Set "Deliver to" → RSS feed
4. Copy the RSS URL and add to GOOGLE_ALERTS_RSS_URLS env var

---

## Step 2 — Local development

```bash
# Clone and install
git clone <your-repo>
cd brand-monitor
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Run locally
npm run dev

# Test a scan
curl -X POST http://localhost:8080/scan/reddit
curl http://localhost:8080/stats
```

---

## Step 3 — Deploy to Google Cloud

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com

# Create Firestore database
gcloud firestore databases create --location=us-central1

# Store secrets in Secret Manager
gcloud secrets create REDDIT_CLIENT_ID --data-file=- <<< "your_value"
gcloud secrets create REDDIT_CLIENT_SECRET --data-file=- <<< "your_value"
gcloud secrets create APIFY_TOKEN --data-file=- <<< "your_value"
gcloud secrets create TWITTER_BEARER_TOKEN --data-file=- <<< "your_value"
gcloud secrets create ANTHROPIC_API_KEY --data-file=- <<< "your_value"
gcloud secrets create SLACK_WEBHOOK_URL --data-file=- <<< "your_value"

# Build and deploy
gcloud builds submit --config cloudbuild.yaml

# After deploy, get your service URL
gcloud run services describe brand-monitor \
  --region=us-central1 \
  --format='value(status.url)'

# Set up Cloud Scheduler jobs
# Edit setup-schedulers.sh with your service URL first
bash setup-schedulers.sh YOUR_PROJECT_ID
```

---

## Step 4 — Configure brands and keywords

Set these environment variables on your Cloud Run service:

```bash
gcloud run services update brand-monitor \
  --region=us-central1 \
  --set-env-vars="BRAND_NAMES=YourBrand,YourBrand Inc" \
  --set-env-vars="COMPETITOR_NAMES=CompetitorA,CompetitorB" \
  --set-env-vars="KEYWORDS=your industry term,pain point keyword" \
  --set-env-vars="GOOGLE_ALERTS_RSS_URLS=https://www.google.com/alerts/feeds/YOUR/FEED"
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | / | Health check |
| POST | /scan/reddit | Trigger Reddit scan |
| POST | /scan/twitter | Trigger Twitter scan |
| POST | /scan/social | Trigger FB/IG/TT scan |
| POST | /scan/web | Trigger web/RSS scan |
| POST | /scan/full | Run all sources |
| GET | /mentions | Get stored mentions (filterable) |
| GET | /stats | Get dashboard stats |

### Mentions query params
- `category` — `defend`, `engage`, `competitor`
- `platform` — `reddit`, `twitter`, `facebook`, `instagram`, `tiktok`
- `urgent` — `true` / `false`
- `minUrgency` — number 1-10
- `hoursBack` — default 24
- `limit` — default 50

---

## Estimated monthly cost (GCP)

| Service | Est. cost |
|---|---|
| Cloud Run | ~$5–10 |
| Cloud Scheduler (5 jobs) | ~$0.15 |
| Firestore | Free tier / ~$1 |
| Secret Manager | Free |
| Cloud Build | Free tier |
| **GCP subtotal** | **~$6–12** |
| Apify (3 social scrapers) | ~$45–100 |
| Twitter API Basic | $100 |
| **Total** | **~$150–210/mo** |
