#!/bin/bash
# proxmox_swarm_boot.sh - The Dark Carnival Protocol 
# Boot this inside an LXC container (e.g. 160, 161) to spawn the full Round-Robin Edge Grid
echo "================================================"
echo "    THE DARK CARNIVAL PROTOCOL - NODE BOOT      "
echo "================================================"

# Base Path where repos are cloned inside your Proxmox container
BASE_PATH="/root"

# Ringmaster Central IP
RINGMASTER="http://192.168.1.116:8000"

echo "[1/3] Terminating any existing zombie nodes..."
kill -9 $(lsof -t -i:8080) $(lsof -t -i:8081) $(lsof -t -i:8082) 2>/dev/null
sleep 2

echo "[2/3] Booting CORE logic node (Port 8080)..."
cd $BASE_PATH/The_Dark_Carnival_Protocol/Self-R || echo "Warn: Ensure codebase is cloned inside container!"
nohup node ./bin/replacater.js serve -p 8080 --role CORE --ringmaster $RINGMASTER > /tmp/core.log 2>&1 &

echo "[3/3] Booting SPECIALIST logic nodes..."
# Assuming you cloned or linked the base dir inside the container for parallel runtime Isolation
nohup node ./bin/replacater.js serve -p 8081 --role OSINT --ringmaster $RINGMASTER > /tmp/osint.log 2>&1 &
nohup node ./bin/replacater.js serve -p 8082 --role MEDIA --ringmaster $RINGMASTER > /tmp/media.log 2>&1 &

sleep 3
echo ""
echo "==== SWARM ACTIVATED ===="
echo "Node Logs available at /tmp/*.log"
echo "Auto-Registration payload successfully fired to Hub at $RINGMASTER"
