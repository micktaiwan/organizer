FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer TOUTES les dépendances (y compris devDependencies pour tsc)
RUN npm ci --legacy-peer-deps

# Copier le code source
COPY . .

# Builder TypeScript
RUN npm run build

# Copy worker.mjs (not compiled by tsc)
RUN cp src/agent/worker.mjs dist/agent/worker.mjs

# --- Image finale légère ---
FROM node:20-alpine

WORKDIR /app

# Install su-exec for entrypoint user switching and ffmpeg for video thumbnails
RUN apk add --no-cache su-exec ffmpeg

# Install Claude Code CLI (required by claude-agent-sdk)
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user (Claude Code refuses --dangerously-skip-permissions as root)
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copier seulement le build
COPY --from=builder /app/dist ./dist

# Create upload directories, logs directory, and set ownership
RUN mkdir -p /app/public/uploads/images /app/public/uploads/files /app/public/uploads/videos /app/public/apk /app/logs && \
    chown -R appuser:appgroup /app

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
