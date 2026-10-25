#!/usr/bin/env bash
# One-command deploy: game server -> Cloud Run, client -> Firebase Hosting (same Google Cloud project).
#   Needs: gcloud + firebase CLI, both logged in (`gcloud auth login`, `firebase login`), billing enabled on the project.
#   usage: deploy/firebase-deploy.sh <firebase-project-id> [region]
set -euo pipefail
PROJECT="${1:?usage: deploy/firebase-deploy.sh <firebase-project-id> [region]}"
REGION="${2:-europe-west1}"
SERVICE=burgwacht-server
cd "$(dirname "$0")/.."

echo "› enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"

echo "› deploying the game server to Cloud Run ($REGION)"
# Rooms live in memory, so exactly one always-on instance (a redeploy resets all running games). Every open WebSocket counts as one
# request, hence the high concurrency; Cloud Run cuts sockets after --timeout (1 h) and clients reconnect automatically.
gcloud run deploy "$SERVICE" --source . --project "$PROJECT" --region "$REGION" \
  --allow-unauthenticated --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --cpu 1 --memory 1Gi --timeout 3600 --concurrency 1000 \
  --set-env-vars "ALLOWED_ORIGINS=https://${PROJECT}.web.app,https://${PROJECT}.firebaseapp.com"
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo "  server: $URL"

echo "› building the client against $URL"
VITE_SERVER_URL="${URL/https:/wss:}" npm run build -w client

echo "› deploying the client to Firebase Hosting"
firebase deploy --only hosting --project "$PROJECT"
echo "✔ live at https://${PROJECT}.web.app"
