#!/bin/bash
# Start the Checkers AI system

echo "[START] Starting Checkers AI System..."
echo ""

# Check if Python dependencies are installed
echo "Checking dependencies..."
pip install -q -r requirements.txt

# Create checkpoints directory
mkdir -p ../checkpoints

echo ""
echo "Starting components:"
echo ""

# Start API server
echo "[1] Starting API Server on http://localhost:8000..."
uvicorn api.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!

# Wait for API to start
sleep 3

# Start learning worker (optional - comment out if not needed)
echo "[2] Starting Learning Worker..."
python -m learning.worker &
WORKER_PID=$!

echo ""
echo "[SUCCESS] System is running!"
echo ""
echo "[INFO] Access points:"
echo "  - API: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
echo "  - Stats: http://localhost:8000/ai/stats"
echo ""
echo "[NEXT] Next steps:"
echo "  1. Open ../index.html in your browser"
echo "  2. Set API_CONFIG.enabled = true in ../script.js"
echo "  3. Play games to train the AI!"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for interrupt
trap "echo ''; echo '[STOP] Stopping services...'; kill $API_PID $WORKER_PID 2>/dev/null; exit" INT
wait
