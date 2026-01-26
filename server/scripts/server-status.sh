#!/bin/bash
# Server status script - returns JSON with system info

# Disk space
read total used free <<< $(df -BG / | awk 'NR==2 {gsub("G",""); print $2, $3, $4}')

# Memory (MB then convert)
read mem_total mem_used mem_free mem_available <<< $(free -m | awk 'NR==2 {print $2, $3, $4, $7}')

# Docker containers
containers=$(docker stats --no-stream --format '{"name":"{{.Name}}","cpu":"{{.CPUPerc}}","memory":"{{.MemUsage}}"}' 2>/dev/null | jq -s '.' || echo '[]')

# Top directories (more paths, sorted by size DESC)
top_dirs=$(sudo du -s /var/lib/docker /var/log /var/cache /usr /opt /home /tmp /root /srv /var/lib/mongodb 2>/dev/null | sort -rn | awk '{printf "{\"path\":\"%s\",\"size_gb\":%.2f}\n", $2, $1/1024/1024}' | jq -s '.')

cat <<EOF
{
  "disk": {"total_gb": $total, "used_gb": $used, "free_gb": $free},
  "memory": {"total_gb": $(awk "BEGIN {printf \"%.2f\", $mem_total/1024}"), "used_gb": $(awk "BEGIN {printf \"%.2f\", $mem_used/1024}"), "free_gb": $(awk "BEGIN {printf \"%.2f\", $mem_free/1024}"), "available_gb": $(awk "BEGIN {printf \"%.2f\", $mem_available/1024}")},
  "containers": $containers,
  "top_dirs": $top_dirs
}
EOF
