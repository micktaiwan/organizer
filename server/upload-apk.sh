#!/bin/bash

# APK Upload Script for Organizer
# Usage: ./upload-apk.sh <apk-file> <version> <versionCode> [release-notes]
#
# Example: ./upload-apk.sh ../android/app/build/outputs/apk/debug/app-debug.apk 1.0.1 2 "Bug fixes"

set -e

# Load credentials if available
if [ -f "$(dirname "$0")/.credentials" ]; then
    source "$(dirname "$0")/.credentials"
fi

# Configuration
SERVER_URL="${APK_SERVER_URL:-http://51.210.150.25:3001}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage function
usage() {
    echo "Usage: $0 <apk-file> <version> <versionCode> [release-notes]"
    echo ""
    echo "Arguments:"
    echo "  apk-file      Path to the APK file"
    echo "  version       Semantic version (e.g., 1.0.1)"
    echo "  versionCode   Android versionCode (integer)"
    echo "  release-notes Optional release notes (string)"
    echo ""
    echo "Environment variables:"
    echo "  APK_SERVER_URL   Server URL (default: http://51.210.150.25:3001)"
    echo ""
    echo "Requires .credentials file with ADMIN_USERNAME and ADMIN_PASSWORD"
    exit 1
}

# Check arguments
if [ $# -lt 3 ]; then
    usage
fi

APK_FILE="$1"
VERSION="$2"
VERSION_CODE="$3"
RELEASE_NOTES="${4:-}"

# Validate APK file exists
if [ ! -f "$APK_FILE" ]; then
    echo -e "${RED}Error: APK file not found: $APK_FILE${NC}"
    exit 1
fi

# Get fresh auth token
if [ -z "$ADMIN_USERNAME" ] || [ -z "$ADMIN_PASSWORD" ]; then
    echo -e "${RED}Error: ADMIN_USERNAME and ADMIN_PASSWORD required in .credentials${NC}"
    exit 1
fi

TOKEN=$(curl -s -X POST "${SERVER_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$ADMIN_USERNAME\", \"password\": \"$ADMIN_PASSWORD\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Error: Failed to get authentication token${NC}"
    exit 1
fi

# Get file size (macOS compatible)
FILE_SIZE=$(stat -f%z "$APK_FILE" 2>/dev/null || stat -c%s "$APK_FILE" 2>/dev/null)
FILE_SIZE_MB=$(echo "scale=2; $FILE_SIZE / 1048576" | bc)

echo -e "${YELLOW}Uploading APK...${NC}"
echo "  File: $APK_FILE"
echo "  Version: $VERSION"
echo "  Version Code: $VERSION_CODE"
echo "  Size: ${FILE_SIZE_MB} MB"
echo ""

# Upload APK
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -F "apk=@$APK_FILE" \
    -F "version=$VERSION" \
    -F "versionCode=$VERSION_CODE" \
    -F "releaseNotes=$RELEASE_NOTES" \
    "${SERVER_URL}/apk/upload")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
    echo -e "${GREEN}Upload successful!${NC}"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}Upload failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    exit 1
fi
