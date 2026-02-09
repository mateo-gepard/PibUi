# 🤖 Quick Start Guide

## Start the Server

```bash
./start.sh
```

Or manually:

```bash
source .venv/bin/activate
python app.py
```

## Access the Control Panel

Open in your browser: **http://localhost:5000**

## Features Overview

### Main Control Panel (`/`)
- **Real-time servo control** - Sliders and numeric inputs
- **Enable/Disable toggles** - Individual servo power control
- **Quick Actions**:
  - Enable All / Disable All
  - Zero All (reset to 0°)
  - Refresh Positions
  - **EMERGENCY STOP** (red button)
- **Pose Presets**:
  - Save current positions with a name
  - Load saved poses instantly
  - Delete unwanted presets

### Calibration Wizard (`/calibrate`)
- Step-by-step servo calibration
- Live position feedback
- Trim offset adjustment
- Fine-tune controls

## Keyboard Shortcuts

- `Cmd/Ctrl + E` - Emergency Stop
- `Cmd/Ctrl + Z` - Zero All Servos
- `Cmd/Ctrl + R` - Refresh Positions

## Servo Layout

The interface organizes servos by body part:

**🖐️ HAND (Green)**
- Daumen (Thumb)
- Zeigefinger (Index finger)
- Mittelfinger (Middle finger)
- Ringfinger (Ring finger)
- Kleiner Finger (Pinky)
- Daumen Gelenk (Thumb joint)
- Handgelenk (Wrist)

**💪 ARM (Yellow)**
- Schulter Horizontal (Shoulder horizontal)
- Schulter Vertikal (Shoulder vertical)
- Bizeps (Biceps)
- Ellbogen (Elbow)
- Unterarm (Forearm)

**🎭 HEAD (Purple)**
- Hals (Neck)
- Nacken (Back of neck)

## Example Workflow

### 1. First Time Setup
1. Run your configuration script to create `servo_config.json`
2. Start the server: `./start.sh`
3. Open http://localhost:5000

### 2. Enable and Test
1. Click "Enable All" to power up all servos
2. Use sliders to test individual servos
3. Click emergency stop if needed

### 3. Create a Pose
1. Position all servos as desired
2. Enter a name in "New preset name" field
3. Click "Save"
4. Your pose is now saved!

### 4. Calibration
1. Click "Calibrate" in the top navigation
2. Follow the wizard for each servo
3. Set trim offsets if mechanical zero is off
4. Save calibration data

## Safety Tips

⚠️ **Important Safety Notes**:
- Always have the **EMERGENCY STOP** button visible
- Start with small movements when testing
- Ensure adequate power supply for servos
- Keep clear of moving parts
- Use the "Disable All" before making physical adjustments

## Troubleshooting

**Server won't start?**
- Make sure virtual environment is activated
- Check that all dependencies are installed
- Verify Python 3.7+ is installed

**Can't connect to Tinkerforge?**
- Ensure `brickd` daemon is running
- Check USB connection to Tinkerforge bricks
- Verify UIDs in `servo_config.json` match your hardware

**Servos not responding?**
- Check that servo is enabled (toggle switch)
- Verify power supply is connected and adequate
- Check physical servo connections
- Look at browser console for errors (F12)

**UI not updating?**
- Check the status indicator (top right)
- Should show green "Connected"
- If disconnected, refresh the page
- Check network connection to server

## Advanced Features

### Mock Mode
If Tinkerforge hardware isn't available, the system runs in **mock mode** automatically:
- Status shows "Mock Mode" (yellow)
- All controls work for testing UI
- No actual hardware commands sent

### API Integration
The Socket.IO backend can be extended with custom events:
```javascript
socket.emit("custom_event", {data: "value"});
```

See `app.py` for backend event handlers.

### Custom Poses
Presets are stored in browser `localStorage`. To export:
```javascript
// In browser console
console.log(localStorage.getItem("humanoid_presets"));
```

## Project Files

- `app.py` - Flask + Socket.IO backend server
- `servo_config.json` - Servo mapping (from your config script)
- `static/index.html` - Main control panel UI
- `static/calibrate.html` - Calibration wizard
- `static/main.js` - Frontend JavaScript logic
- `requirements.txt` - Python dependencies
- `start.sh` - Convenience startup script

## Next Steps

1. ✅ Server running at http://localhost:5000
2. 🎮 Test individual servo controls
3. 📝 Create your first pose preset
4. 🔧 Run calibration wizard if needed
5. 🤖 Start controlling your humanoid!

## Support

For issues or questions:
- Check the main README.md
- Review browser console (F12) for errors
- Check server terminal output for backend errors

---

**Enjoy controlling your humanoid robot!** 🚀
