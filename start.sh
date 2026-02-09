#!/bin/bash
# Start the Humanoid Control Server

cd "$(dirname "$0")"

echo "🤖 Starting Humanoid Robot Control System..."
echo ""

# Activate virtual environment
source .venv/bin/activate

# Check if servo_config.json exists
if [ ! -f "servo_config.json" ]; then
    echo "⚠️  Warning: servo_config.json not found!"
    echo "   Please run your configuration script first."
    echo ""
fi

# Start the server
echo "🚀 Launching server on http://localhost:5000"
echo "   Press Ctrl+C to stop"
echo ""

python app.py
