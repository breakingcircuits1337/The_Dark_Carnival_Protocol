#!/bin/bash
# launch_node.sh - The Dark Carnival Protocol Edge Node

if [ "$#" -ne 2 ]; then
    echo "Usage: ./launch_node.sh <PORT> <ROLE>"
    echo "Example: ./launch_node.sh 8081 OSINT"
    exit 1
fi

PORT=$1
ROLE=$2
RINGMASTER_URL="http://192.168.1.116:8000"

echo "Booting Dark Carnival Edge Node ($ROLE) on Port $PORT..."
cd Self-R

if [ ! -d "node_modules" ]; then
    echo "First time setup: Installing Node dependencies..."
    npm install
    npm run build
fi

# Run the node
node ./bin/replacater.js serve -p $PORT --role $ROLE --ringmaster $RINGMASTER_URL
