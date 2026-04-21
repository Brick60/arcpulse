#!/bin/bash
# Usage: bash setup-schedulers.sh your-gcp-project-id your-cloud-run-url
PROJECT_ID=${1:-"your-project-id"}
SERVICE_URL=${2:-"https://arcpulse-XXXX-uc.a.run.app"}
REGION="us-central1"

echo "Setting up ArcPulse schedulers..."

gcloud scheduler jobs create http arcpulse-reddit \
  --project=$PROJECT_ID --location=$REGION \
  --schedule="*/15 * * * *" \
  --uri="$SERVICE_URL/scan/reddit" \
  --http-method=POST --message-body='{}' \
  --headers="Content-Type=application/json" \
  --description="Reddit scan every 15 minutes"

gcloud scheduler jobs create http arcpulse-web \
  --project=$PROJECT_ID --location=$REGION \
  --schedule="0 * * * *" \
  --uri="$SERVICE_URL/scan/web" \
  --http-method=POST --message-body='{}' \
  --headers="Content-Type=application/json" \
  --description="Web/RSS/HN scan every hour"

echo "Done. Jobs created:"
gcloud scheduler jobs list --project=$PROJECT_ID --location=$REGION
