#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

if [ "${SKIP_CLOUD_POST_COMMIT_DEPLOY:-}" = "1" ]; then
  echo "Skipping post-commit cloud function deployment because SKIP_CLOUD_POST_COMMIT_DEPLOY=1."
  exit 0
fi

echo "Post-commit cloud function deployment check..."
if ! bash scripts/deploy-changed-cloudfunctions.sh --commit HEAD; then
  echo "ERROR: Post-commit cloud function deployment failed." >&2
  echo "The commit was created, but cloud deployment did not complete." >&2
  echo "Fix the issue and run: npm run deploy:cloud:changed" >&2
  exit 1
fi
