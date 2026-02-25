# Release Notes

## 2026-02-25

### WebRTC calls via external browser on Linux
- On Linux (WebKitGTK without native WebRTC), calls now open in the default browser
- New standalone `/call` page served by the backend handles the full WebRTC lifecycle
- Tauri app shows "Appel ouvert dans le navigateur" overlay while call is in browser
- Works for both outgoing and incoming calls
- JWT passed securely via URL hash fragment (never sent to server)

### Fix: auth token cleared on network errors
- Previously, any failure on `GET /auth/me` (network timeout, server error) would clear the saved token, forcing re-login
- Now only HTTP 401 (truly expired/invalid token) clears auth
- Network/server errors keep the token and connect socket for retry

### Server deployment fixes
- Fixed CRLF line endings in `docker-entrypoint.sh` and `deploy.sh`
- Added `call.html` to Docker image via Dockerfile
- Restored MongoDB auth credentials in `docker-compose.prod.yml`
- Git remote switched from HTTPS to SSH for push access on Linux
