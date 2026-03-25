# app.py
from flask import Flask, send_from_directory, jsonify
from flask_socketio import SocketIO, emit
import json
import os
import threading
import time

# Try to import Tinkerforge; if unavailable run in mock mode
try:
    from tinkerforge.ip_connection import IPConnection
    from tinkerforge.bricklet_servo_v2 import BrickletServoV2
    TINKER_AVAILABLE = True
except Exception:
    TINKER_AVAILABLE = False

# Config
CONFIG_FILE = "servo_config.json"
HOST = "localhost"
PORT_TF = 4223

app = Flask(__name__, static_folder="static", static_url_path="/static")
socketio = SocketIO(app, cors_allowed_origins="*")

# Runtime state
state = {
    "connected": False,
    "mock": not TINKER_AVAILABLE,
    "servos": {},
    "bricks": {}, 
    "ipcon": None,
    "servo_initialized": set()  # Track which servos have been hardware-configured
}
state_lock = threading.Lock()
monitor_thread = None
monitor_lock = threading.Lock()
monitor_stop = threading.Event()  # #17: Shutdown mechanism for monitor thread

# Helpers
def load_config():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        print(f"Warning: {CONFIG_FILE} not found. Creating empty config.")
        cfg = {"servos": {}, "bricks": {}}
    
    servos = cfg.get("servos", {})
    bricks_cfg = cfg.get("bricks", {})
    with state_lock:
        state["servos"] = {}
        state["bricks_cfg"] = bricks_cfg
        state["servo_initialized"] = set()
        # initialize servo entries
        for name, meta in servos.items():
            state["servos"][name] = {
                "brick": meta["brick"],
                "channel": meta["channel"],
                "enabled": False,
                "position_cdeg": 0,   # centi-degrees
                "min_cdeg": -9000,
                "max_cdeg": 9000,
                "trim_cdeg": 0  # #5: Calibration trim offset
            }

def connect_tinker():
    if state["mock"]:
        # #6: In mock mode, set connected=True so the UI can show "Mock Mode"
        with state_lock:
            state["connected"] = True
        return
    ipcon = IPConnection()
    ipcon.connect(HOST, PORT_TF)
    bricks = {}
    # create BrickletServoV2 objects for unique bricks
    for key, uid in state["bricks_cfg"].items():
        bricks[key] = BrickletServoV2(uid, ipcon)
    with state_lock:
        state["ipcon"] = ipcon
        state["bricks"] = bricks
        state["connected"] = True

def _serialize_servo(name, meta):
    """#14: Shared helper to build a servo info dict for the client."""
    return {
        "brick": meta["brick"],
        "channel": meta["channel"],
        "enabled": meta["enabled"],
        "position_deg": meta["position_cdeg"] / 100.0,
        "min_deg": meta["min_cdeg"] / 100.0,
        "max_deg": meta["max_cdeg"] / 100.0,
        "trim_deg": meta.get("trim_cdeg", 0) / 100.0
    }

def _init_servo_hardware(brick, ch, min_cdeg, max_cdeg):
    """#13: One-time hardware configuration per servo channel."""
    brick.set_degree(ch, min_cdeg, max_cdeg)
    brick.set_pulse_width(ch, 500, 2500)
    brick.set_period(ch, 20000)
    brick.set_motion_configuration(ch, 15000, 15000, 15000)

def safe_set_position(name, degree, duration_ms=300):
    # degree is float degrees (e.g., 30.5). Convert to centi-deg
    # #3: Hold the lock for the entire operation on state, copy needed values
    with state_lock:
        s = state["servos"].get(name)
        if not s:
            return {"ok": False, "error": "unknown servo"}
        target_cdeg = int(round(degree * 100))
        target_cdeg = max(s["min_cdeg"], min(s["max_cdeg"], target_cdeg))
        brick_key = s["brick"]
        ch = s["channel"]
        min_cdeg = s["min_cdeg"]
        max_cdeg = s["max_cdeg"]
        is_mock = state["mock"]
        is_connected = state["connected"]
        if is_mock or not is_connected:
            s["position_cdeg"] = target_cdeg
            return {"ok": True, "position_cdeg": target_cdeg}
        brick = state["bricks"].get(brick_key)
        servo_key = f"{brick_key}:{ch}"
        needs_init = servo_key not in state["servo_initialized"]
    try:
        # #13: Only configure hardware on first use
        if needs_init:
            _init_servo_hardware(brick, ch, min_cdeg, max_cdeg)
            with state_lock:
                state["servo_initialized"].add(servo_key)
        brick.set_position(ch, target_cdeg)
        with state_lock:
            s["position_cdeg"] = target_cdeg
        return {"ok": True, "position_cdeg": target_cdeg}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_current_readings():
    """Get current readings from all servos"""
    currents = {}  # name -> current in mA
    total_current = 0
    
    with state_lock:
        servos = dict(state["servos"])
        bricks = dict(state["bricks"])
        connected = state["connected"]
        mock = state["mock"]
    
    if not connected or mock:
        # Mock mode - return dummy data
        for name in servos.keys():
            currents[name] = 50  # Mock: 50mA per servo
            total_current += 50
        return {"currents": currents, "total": total_current}
    
    try:
        brick_statuses = {}  # Cache statuses per brick to avoid multiple I/O calls
        failed_bricks = set()  # Track failed bricks to prevent repeated timeouts in the same cycle
        for name, servo_info in servos.items():
            brick_key = servo_info["brick"]
            ch = servo_info["channel"]
            brick = bricks.get(brick_key)
            if brick and brick_key not in failed_bricks:
                try:
                    if brick_key not in brick_statuses:
                        brick_statuses[brick_key] = brick.get_status()
                    current = brick_statuses[brick_key].current[ch]
                    currents[name] = int(current)
                    total_current += int(current)
                except Exception as e:
                    failed_bricks.add(brick_key)
                    if "in time (-1)" in str(e):
                        print(f"Timeout reading current for brick '{brick_key}' (skipping remaining servos on this brick)")
                    else:
                        print(f"Error reading current for {name}: {e}")
    except Exception as e:
        print(f"Error reading current: {e}")
    
    return {"currents": currents, "total": total_current}

def set_enable(name, enable):
    # #4: Copy values from state inside lock, operate on hardware outside
    with state_lock:
        s = state["servos"].get(name)
        if not s:
            return {"ok": False, "error": "unknown servo", "enabled": False}
        ch = s["channel"]
        brick_key = s["brick"]
        is_mock = state["mock"]
        is_connected = state["connected"]
        if is_mock or not is_connected:
            s["enabled"] = bool(enable)
            return {"ok": True, "enabled": s["enabled"]}
        brick = state["bricks"].get(brick_key)
    try:
        brick.set_enable(ch, bool(enable))
        with state_lock:
            s["enabled"] = bool(enable)
        return {"ok": True, "enabled": bool(enable)}
    except Exception as e:
        with state_lock:
            current_enabled = s["enabled"]
        return {"ok": False, "error": str(e), "enabled": current_enabled}

# Background Monitor
def current_monitor():
    """Background thread to continuously broadcast current readings"""
    # #17: Use stop event for clean shutdown
    while not monitor_stop.is_set():
        try:
            current_data = get_current_readings()
            socketio.emit("current_update", current_data, namespace="/")
            socketio.sleep(0.5)  # Update every 500ms
        except Exception as e:
            print(f"Error in current monitor: {e}")
            socketio.sleep(1)

# Flask routes
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/calibrate")
def calibrate_page():
    return send_from_directory("static", "calibrate.html")

@app.route("/discover")
def discover_page():
    return send_from_directory("static", "discover.html")

@app.route("/config.json")
def config_json():
    # #11: Hold lock for entire payload construction
    with state_lock:
        servos = state["servos"]
        payload = {name: _serialize_servo(name, meta) for name, meta in servos.items()}
        connected = state["connected"]
        mock = state["mock"]
    return jsonify({"servos": payload, "connected": connected, "mock": mock})

# Socket.IO events
@socketio.on("connect")
def handle_connect():
    global monitor_thread
    with monitor_lock:
        if monitor_thread is None:
            monitor_stop.clear()
            monitor_thread = socketio.start_background_task(current_monitor)
            
    with state_lock:
        connected = state["connected"]
        mock = state["mock"]
        servo_payload = {k: _serialize_servo(k, v) for k, v in state["servos"].items()}
    
    emit("status", {"connected": connected, "mock": mock})
    emit("config", {"servos": servo_payload})

@socketio.on("set_position")
def on_set_position(data):
    # #12: Validate incoming data
    if not isinstance(data, dict):
        emit("position_update", {"name": None, "ok": False, "position_deg": 0})
        return
    name = data.get("name")
    try:
        deg = float(data.get("degree", 0.0))
    except (TypeError, ValueError):
        emit("position_update", {"name": name, "ok": False, "position_deg": 0})
        return
    res = safe_set_position(name, deg)
    emit("position_update", {"name": name, "ok": res.get("ok"), "position_deg": res.get("position_cdeg", 0) / 100.0})

@socketio.on("set_enable")
def on_set_enable(data):
    # #12: Validate incoming data
    if not isinstance(data, dict):
        return
    name = data.get("name")
    enable = bool(data.get("enable"))
    res = set_enable(name, enable)
    emit("enable_update", {"name": name, "ok": res.get("ok"), "enabled": res.get("enabled", False)})

@socketio.on("emergency_stop")
def on_emergency_stop():
    # disable all servos immediately
    results = {}
    with state_lock:
        names = list(state["servos"].keys())
    for name in names:
        r = set_enable(name, False)
        results[name] = r
        emit("enable_update", {"name": name, "ok": r.get("ok"), "enabled": r.get("enabled", False)})
    emit("emergency_ack", {"ok": True})

@socketio.on("get_positions")
def on_get_positions():
    with state_lock:
        payload = {n: s["position_cdeg"] / 100.0 for n, s in state["servos"].items()}
    emit("positions", payload)

@socketio.on("enable_all")
def on_enable_all(data):
    # #12: Validate incoming data
    if not isinstance(data, dict):
        return
    enable = bool(data.get("enable", True))
    with state_lock:
        names = list(state["servos"].keys())
    
    def enable_sequence():
        total = len(names)
        for idx, name in enumerate(names, 1):
            res = set_enable(name, enable)
            # Emit feedback for each motor as it's enabled to all clients
            socketio.emit("motor_enabled", {
                "name": name, 
                "enabled": res.get("enabled", False),
                "ok": res.get("ok", False),
                "progress": idx,
                "total": total
            }, namespace="/")
            
            # Small delay between each motor
            if idx < total:
                socketio.sleep(0.05)
        
        # #2: Send the enable state back so client knows what completed
        socketio.emit("all_enabled", {"enabled": enable}, namespace="/")
    
    # Send started signal immediately
    emit("enable_all_started", {
        "enabled": enable, 
        "total": len(names)
    })
    
    # Run in background thread to avoid blocking
    socketio.start_background_task(enable_sequence)

@socketio.on("zero_all")
def on_zero_all():
    with state_lock:
        names = list(state["servos"].keys())
    for name in names:
        res = safe_set_position(name, 0.0)
        emit("position_update", {"name": name, "ok": res.get("ok"), "position_deg": res.get("position_cdeg", 0) / 100.0})
    emit("all_zeroed", {})

@socketio.on("set_trim")
def on_set_trim(data):
    """#5: Receive and store trim offset from calibration wizard."""
    if not isinstance(data, dict):
        return
    name = data.get("name")
    try:
        trim_deg = float(data.get("trim", 0.0))
    except (TypeError, ValueError):
        emit("trim_update", {"name": name, "ok": False})
        return
    with state_lock:
        s = state["servos"].get(name)
        if not s:
            emit("trim_update", {"name": name, "ok": False, "error": "unknown servo"})
            return
        s["trim_cdeg"] = int(round(trim_deg * 100))
    emit("trim_update", {"name": name, "ok": True, "trim_deg": trim_deg})

@socketio.on("wave_motion")
def on_wave_motion():
    
    def wave_sequence():
        wave_servos = {
            "Schulter_Horizontal": [-45, 0, -45, 0, -45, 0],
            "Ellenbogen": [90, 45, 90, 45, 90, 0],
            "Handgelenk": [30, -30, 30, -30, 30, 0],
            "Zeigefinger": [45, 0, 45, 0, 45, 0],
            "Mittelfinger": [45, 0, 45, 0, 45, 0],
            "Ringfinger": [45, 0, 45, 0, 45, 0],
            "Kleiner_Finger": [45, 0, 45, 0, 45, 0],
        }
        for step in range(6):
            for servo_name, angles in wave_servos.items():
                if servo_name in state["servos"]:
                    safe_set_position(servo_name, angles[step])
            socketio.sleep(0.4)
        socketio.emit("wave_complete", {}, namespace="/")
    
    socketio.start_background_task(wave_sequence)
    emit("wave_started", {})

# ─── Motor Discovery ───
NUM_CHANNELS = 10  # Servo Brick V2 has channels 0-9

@socketio.on("discovery_start")
def on_discovery_start():
    """List all brick/channel combos for discovery."""
    with state_lock:
        bricks_cfg = dict(state.get("bricks_cfg", {}))
    channels = []
    for brick_key in sorted(bricks_cfg.keys()):
        for ch in range(NUM_CHANNELS):
            channels.append({"brick": brick_key, "channel": ch})
    emit("discovery_channels", {"channels": channels, "bricks": bricks_cfg})

@socketio.on("discovery_test")
def on_discovery_test(data):
    """Nudge a specific brick/channel to identify the motor."""
    if not isinstance(data, dict):
        emit("discovery_test_done", {"ok": False, "error": "invalid data"})
        return
    brick_key = data.get("brick")
    ch = data.get("channel")
    if brick_key is None or ch is None:
        emit("discovery_test_done", {"ok": False, "error": "missing brick/channel"})
        return
    ch = int(ch)

    with state_lock:
        is_mock = state["mock"]
        brick = state["bricks"].get(brick_key)

    if is_mock:
        # Simulate a test delay in mock mode
        socketio.sleep(0.8)
        emit("discovery_test_done", {"ok": True, "brick": brick_key, "channel": ch})
        return

    if not brick:
        emit("discovery_test_done", {"ok": False, "error": f"brick {brick_key} not found"})
        return

    def nudge():
        try:
            brick.set_degree(ch, -9000, 9000)
            brick.set_pulse_width(ch, 500, 2500)
            brick.set_period(ch, 20000)
            brick.set_motion_configuration(ch, 50000, 50000, 50000)
            brick.set_enable(ch, True)
            socketio.sleep(0.15)
            brick.set_position(ch, 2000)  # +20 degrees
            socketio.sleep(0.5)
            brick.set_position(ch, -2000)  # -20 degrees
            socketio.sleep(0.5)
            brick.set_position(ch, 0)
            socketio.sleep(0.3)
            brick.set_enable(ch, False)
            socketio.emit("discovery_test_done", {"ok": True, "brick": brick_key, "channel": ch}, namespace="/")
        except Exception as e:
            try:
                brick.set_enable(ch, False)
            except Exception:
                pass
            socketio.emit("discovery_test_done", {"ok": False, "error": str(e)}, namespace="/")

    socketio.start_background_task(nudge)

@socketio.on("discovery_save")
def on_discovery_save(data):
    """Save discovered motor assignments to servo_config.json."""
    if not isinstance(data, dict):
        emit("discovery_saved", {"ok": False, "error": "invalid data"})
        return
    entries = data.get("assignments", [])
    if not entries:
        emit("discovery_saved", {"ok": False, "error": "no assignments"})
        return

    with state_lock:
        bricks_cfg = dict(state.get("bricks_cfg", {}))

    new_servos = {}
    for entry in entries:
        name = entry.get("name", "").strip()
        brick = entry.get("brick", "")
        channel = entry.get("channel")
        if name and brick and channel is not None:
            new_servos[name] = {"brick": brick, "channel": int(channel)}

    new_config = {"bricks": bricks_cfg, "servos": new_servos}

    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(new_config, f, indent=2, ensure_ascii=False)
        # Reload the config
        load_config()
        emit("discovery_saved", {"ok": True, "count": len(new_servos)})
    except Exception as e:
        emit("discovery_saved", {"ok": False, "error": str(e)})

# Startup
if __name__ == "__main__":
    load_config()
    try:
        connect_tinker()
        if state["mock"]:
            print(f"✓ Running in Mock mode (Tinkerforge not available)")
        else:
            print(f"✓ Connected to Tinkerforge at {HOST}:{PORT_TF}")
    except Exception as e:
        print(f"⚠ Could not connect to Tinkerforge: {e}")
        state["connected"] = False
    
    # #23: Configurable debug mode via environment variable
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() in ("true", "1", "yes")
    
    print(f"✓ Server starting on http://0.0.0.0:5001")
    print(f"  Servos loaded: {len(state['servos'])}")
    print(f"  Mode: {'Mock' if state['mock'] else 'Hardware'}")
    print(f"  Debug: {debug_mode}")
    socketio.run(app, host="0.0.0.0", port=5001, debug=debug_mode)