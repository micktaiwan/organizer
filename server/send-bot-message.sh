#!/bin/bash
# Send a message to a room via the bot account
# Usage: ./send-bot-message.sh <room-name> <message>
# Example: ./send-bot-message.sh "Tests" "Hello from bot!"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.credentials-bot"

SERVER_URL="http://51.210.150.25:3001"
ROOM_NAME="$1"
MESSAGE="$2"

if [ -z "$ROOM_NAME" ] || [ -z "$MESSAGE" ]; then
    echo "Usage: ./send-bot-message.sh <room-name> <message>"
    echo "Example: ./send-bot-message.sh \"Tests\" \"Hello from bot!\""
    exit 1
fi

# Get auth token
TOKEN=$(curl -s -X POST "$SERVER_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$BOT_USERNAME\", \"password\": \"$BOT_PASSWORD\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('token', ''))")

if [ -z "$TOKEN" ]; then
    echo "Error: Failed to get auth token"
    exit 1
fi

# Get room ID by name
ROOM_ID=$(curl -s -X GET "$SERVER_URL/rooms" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; data=json.load(sys.stdin); rooms=data.get('rooms', data); print(next((r['_id'] for r in rooms if r.get('name') == '$ROOM_NAME'), ''))")

if [ -z "$ROOM_ID" ]; then
    echo "Error: Room '$ROOM_NAME' not found"
    exit 1
fi

# Send message using Python to handle JSON encoding properly
python3 << PYTHON
import json
import urllib.request

token = "$TOKEN"
room_id = "$ROOM_ID"
content = '''$MESSAGE'''

data = json.dumps({"roomId": room_id, "type": "text", "content": content}).encode('utf-8')

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
        print(f"Message sent to {result['message']['roomId']}")
except urllib.error.HTTPError as e:
    print(f"Error: {e.code} - {e.read().decode('utf-8')}")
    exit(1)
PYTHON
