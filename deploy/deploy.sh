#!/usr/bin/env bash
# Runs on the VPS. Builds the frontend image from the uploaded source tarball
# and (re)starts the container.
set -euo pipefail

TARBALL="${1:?usage: deploy.sh <source.tar.gz> <api-url>}"
API_URL="${2:?usage: deploy.sh <source.tar.gz> <api-url>}"
IMAGE=coteacher-frontend
CONTAINER=coteacher-frontend

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
tar -xzf "$TARBALL" -C "$BUILD_DIR"

docker build --build-arg VITE_API_URL="$API_URL" -t "$IMAGE:latest" "$BUILD_DIR"

docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p 127.0.0.1:8080:80 \
  "$IMAGE:latest"

docker image prune -f >/dev/null
rm -f "$TARBALL"
echo "Frontend deployed."
