#!/bin/bash
# Send a system announcement to the Lobby
# Usage: ./send-announcement.sh "Message content"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.credentials"

SERVER_URL="http://51.210.150.25:3001"
MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
    echo "Usage: ./send-announcement.sh \"Message content\""
    exit 1
fi

# Get auth token
TOKEN=$(curl -s -X POST "$SERVER_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$ADMIN_USERNAME\", \"password\": \"$ADMIN_PASSWORD\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

if [ -z "$TOKEN" ]; then
    echo "Error: Failed to get auth token"
    exit 1
fi

# Get Lobby room ID
LOBBY_ID=$(curl -s -X GET "$SERVER_URL/rooms" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; data=json.load(sys.stdin); rooms=data.get('rooms', data); print(next((r['_id'] for r in rooms if r.get('isLobby')), ''))")

if [ -z "$LOBBY_ID" ]; then
    echo "Error: Failed to get Lobby ID"
    exit 1
fi

# Send message using Python to handle JSON encoding properly
python3 << PYTHON
import json
import urllib.request

token = "$TOKEN"
lobby_id = "$LOBBY_ID"
content = '''$MESSAGE'''

data = json.dumps({"roomId": lobby_id, "type": "system", "content": content}).encode('utf-8')

req = urllib.request.Request(
    "$SERVER_URL/messages",
    data=data,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        print("✅ Announcement sent successfully!")
        print(f"Message ID: {result['message']['_id']}")
except urllib.error.HTTPError as e:
    print(f"❌ Error: {e.code} - {e.read().decode('utf-8')}")
    exit(1)
PYTHON
