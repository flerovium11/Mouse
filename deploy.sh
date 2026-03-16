#!/usr/bin/env bash

# Prerequisites:
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   Fill in .env (copy from .env.example)
#   ./deploy.sh

set -euo pipefail

# Load .env from repo root
ENV_FILE="$(dirname "$0")/.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${GCP_REGION:-europe-west6}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-mouse-backend}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  echo "Error: AWS_ACCESS_KEY_ID is not set in .env" >&2
  exit 1
fi

if [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "Error: AWS_SECRET_ACCESS_KEY is not set in .env" >&2
  exit 1
fi

if [[ -z "${AWS_REGION:-}" ]]; then
  echo "Error: AWS_REGION is not set in .env" >&2
  exit 1
fi

if [[ -z "${AUTH_TOKEN:-}" ]]; then
  echo "Error: AUTH_TOKEN is not set in .env" >&2
  exit 1
fi

echo "Enabling required GCP APIs"
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${PROJECT_ID}"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Storing secrets in Secret Manager"
for SECRET_NAME in aws-access-key-id aws-secret-access-key aws-region auth-token; do
  VAR_NAME="${SECRET_NAME//-/_}"
  VAR_NAME="${VAR_NAME^^}"
  SECRET_VALUE="${!VAR_NAME//[$'\t\r\n ']}"  # strip all whitespace

  if gcloud secrets describe "${SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "    ${SECRET_NAME}: already exists, adding new version."
    printf '%s' "${SECRET_VALUE}" | gcloud secrets versions add "${SECRET_NAME}" \
      --data-file=- --project="${PROJECT_ID}"
  else
    printf '%s' "${SECRET_VALUE}" | gcloud secrets create "${SECRET_NAME}" \
      --data-file=- --replication-policy=automatic --project="${PROJECT_ID}"
  fi

  gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}"
done

SET_SECRETS="AWS_ACCESS_KEY_ID=aws-access-key-id:latest,AWS_SECRET_ACCESS_KEY=aws-secret-access-key:latest,AWS_REGION=aws-region:latest,AUTH_TOKEN=auth-token:latest"

if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
  SECRET_NAME="aws-session-token"
  SECRET_VALUE="${AWS_SESSION_TOKEN//[$'\t\r\n ']}"

  if gcloud secrets describe "${SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "    ${SECRET_NAME}: already exists, adding new version."
    printf '%s' "${SECRET_VALUE}" | gcloud secrets versions add "${SECRET_NAME}" \
      --data-file=- --project="${PROJECT_ID}"
  else
    printf '%s' "${SECRET_VALUE}" | gcloud secrets create "${SECRET_NAME}" \
      --data-file=- --replication-policy=automatic --project="${PROJECT_ID}"
  fi

  gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}"

  SET_SECRETS=","${SET_SECRETS}
  SET_SECRETS="AWS_SESSION_TOKEN=aws-session-token:latest${SET_SECRETS}"
fi

echo "Building and pushing Docker image: ${IMAGE}"
gcloud builds submit ./backend \
  --tag="${IMAGE}" \
  --project="${PROJECT_ID}"

echo "Deploying to Cloud Run service: ${SERVICE_NAME} in ${REGION}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets="${SET_SECRETS}" \
  --set-env-vars="BEDROCK_GENERATION_MODEL=${BEDROCK_GENERATION_MODEL:-amazon.nova-lite-v1:0},BEDROCK_EMBEDDING_MODEL=${BEDROCK_EMBEDDING_MODEL:-amazon.titan-embed-text-v2:0},BEDROCK_EMBEDDING_DIM=${BEDROCK_EMBEDDING_DIM:-1024}" \
  --project="${PROJECT_ID}"

echo ""
echo "Deployment complete!"
gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)" | xargs -I{} echo "Service URL: {}"
