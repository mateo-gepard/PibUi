# Humanoid Robot Control System

Professional web-based control interface for Tinkerforge servo-controlled humanoid robot.

## Features

✨ **Professional UI**
- Real-time servo control with Socket.IO
- Beautiful, responsive design with Bootstrap 5
- Live position feedback and status indicators
- Organized by body parts (hand, arm, head)

🎮 **Control Features**
- Individual servo enable/disable
- Precise position control with sliders and numeric input
- Quick zero/reset buttons
- Emergency stop functionality
- Enable/disable all servos at once

💾 **Pose Management**
- Save current pose as named preset
- Load saved poses instantly
- Delete unwanted presets
- Presets stored in browser localStorage

🔧 **Calibration Wizard**
- Step-by-step calibration for each servo
- Live position feedback
- Trim offset adjustment for mechanical zero
- Fine-tune controls (±1°, ±10°)

⌨️ **Keyboard Shortcuts**
- `Ctrl/Cmd + E`: Emergency stop
- `Ctrl/Cmd + Z`: Zero all servos
- `Ctrl/Cmd + R`: Refresh positions

## Setup

### 1. Generate Servo Configuration

First, run your configuration script to map servos:

```bash
python your_config_script.py
```

This will create `servo_config.json` with your servo mappings.

### 2. Install Dependencies

```bash
python -m venv .venv
source .venv/bin/activate  # On macOS/Linux
pip install -r requirements.txt
```

### 3. Start the Server

```bash
python app.py
```

### 4. Open the Control Panel

Navigate to: **http://localhost:5000**

## Project Structure

```
pib/
├── app.py                      # Flask + Socket.IO backend
├── requirements.txt            # Python dependencies
├── servo_config.json          # Servo configuration (generated)
├── static/
│   ├── index.html             # Main control panel
│   ├── calibrate.html         # Calibration wizard
│   └── main.js                # Frontend logic
└── README.md                  # This file
```

## Servo Groups

The interface automatically categorizes servos:

**Hand (Green)**: Daumen, Zeigefinger, Mittelfinger, Ringfinger, Kleiner Finger  
**Arm (Yellow)**: Ellbogen, Unterarm, Bizeps, Schulter Vertikal, Schulter Horizontal  
**Head (Purple)**: Hals, Nacken

## Configuration

Edit `app.py` to change:
- `HOST`: Tinkerforge host (default: localhost)
- `PORT_TF`: Tinkerforge port (default: 4223)
- `CONFIG_FILE`: Path to servo config JSON

## Mock Mode

If Tinkerforge is not available, the system runs in **mock mode** - perfect for UI development and testing without hardware.

## Safety

- ⚠️ **Emergency Stop** button immediately disables all servos
- Position limits are enforced (±90° default, configurable per servo)
- Safe enable/disable with state tracking
- Hardware connection status monitoring

## Advanced Usage

### Calibration Workflow

1. Click "Calibrate" in top navigation
2. For each servo:
   - Enable the servo
   - Move to natural zero position
   - Set trim offset if needed
   - Save trim values
3. Trim data is stored in browser localStorage

### Creating Poses

1. Position all servos as desired
2. Enter a name in "New preset name"
3. Click "Save"
4. Load anytime from dropdown

### API Extensions

The Socket.IO backend supports:
- `set_position`: Move servo to position
- `set_enable`: Enable/disable servo
- `get_positions`: Refresh all positions
- `emergency_stop`: Disable all servos
- `enable_all`: Enable/disable all at once
- `zero_all`: Move all to 0°

## Troubleshooting

**Can't connect to Tinkerforge?**
- Ensure `brickd` is running
- Check HOST and PORT_TF in app.py
- Verify UIDs in servo_config.json

**Servos not moving?**
- Check enable toggle is ON
- Verify servo power supply
- Check Tinkerforge connection status

**UI not updating?**
- Check browser console for errors
- Ensure Socket.IO connection (status indicator)
- Try hard refresh (Ctrl+Shift+R)

## License

MIT License - Free to use and modify

## Credits

Built with Flask, Socket.IO, Bootstrap 5, and Tinkerforge API
