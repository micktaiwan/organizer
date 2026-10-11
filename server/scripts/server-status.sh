#!/bin/bash
# Server status script - streams one JSON line per step: {"step": "...", "data": ...}
# Embedded in the desktop app (src-tauri/src/lib.rs) and piped to `ssh ... bash -s`,
# so nothing needs to be installed on the server.

# Disk space
read total used free <<< $(df -BG / | awk 'NR==2 {gsub("G",""); print $2, $3, $4}')
echo "{\"step\":\"disk\",\"data\":{\"total_gb\":$total,\"used_gb\":$used,\"free_gb\":$free}}"

# Memory (MB then convert)
read mem_total mem_used mem_free mem_available <<< $(free -m | awk 'NR==2 {print $2, $3, $4, $7}')
awk -v t="$mem_total" -v u="$mem_used" -v f="$mem_free" -v a="$mem_available" \
  'BEGIN {printf "{\"step\":\"memory\",\"data\":{\"total_gb\":%.2f,\"used_gb\":%.2f,\"free_gb\":%.2f,\"available_gb\":%.2f}}\n", t/1024, u/1024, f/1024, a/1024}'

# Docker containers
containers=$(docker stats --no-stream --format '{"name":"{{.Name}}","cpu":"{{.CPUPerc}}","memory":"{{.MemUsage}}"}' 2>/dev/null | jq -cs '.')
echo "{\"step\":\"containers\",\"data\":${containers:-[]}}"

# Top directories, sorted by size DESC
top_dirs=$(sudo -n du -s /var/lib/docker /var/log /var/cache /usr /opt /home /tmp /root /srv /var/www /var/lib/mongodb 2>/dev/null | sort -rn | awk '{printf "{\"path\":\"%s\",\"size_gb\":%.2f}\n", $2, $1/1024/1024}' | jq -cs '.')
echo "{\"step\":\"dirs\",\"data\":${top_dirs:-[]}}"

echo '{"step":"done"}'
