#!/bin/bash
# launch_ringmaster.sh - The Dark Carnival Protocol Hub
echo "Starting The Ringmaster Hub..."
cd Ringmaster

if [ ! -d "venv" ]; then
    echo "First time setup: Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Run the Uvicorn FastAPI server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
