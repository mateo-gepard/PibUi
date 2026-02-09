# app.py
from flask import Flask, send_from_directory, jsonify
from flask_socketio import SocketIO, emit
import json
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
    "servos": {},  # name -> {brick_key, uid, channel, enabled, position_cdeg}
    "bricks": {},  # key -> BrickletServoV2 instance (or mock)
    "ipcon": None
}
state_lock = threading.Lock()

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
        # initialize servo entries
        for name, meta in servos.items():
            state["servos"][name] = {
                "brick": meta["brick"],
                "uid": meta.get("uid"),
                "channel": meta["channel"],
                "enabled": False,
                "position_cdeg": 0,   # centi-degrees
                "min_cdeg": -9000,
                "max_cdeg": 9000
            }

def connect_tinker():
    if state["mock"]:
        state["connected"] = False
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

def safe_set_position(name, degree, duration_ms=300):
    # degree is float degrees (e.g., 30.5). Convert to centi-deg
    with state_lock:
        s = state["servos"].get(name)
        if not s:
            return {"ok": False, "error": "unknown servo"}
        target_cdeg = int(round(degree * 100))
        target_cdeg = max(s["min_cdeg"], min(s["max_cdeg"], target_cdeg))
        brick_key = s["brick"]
        ch = s["channel"]
        if state["mock"] or not state["connected"]:
            s["position_cdeg"] = target_cdeg
            return {"ok": True, "position_cdeg": target_cdeg}
        brick = state["bricks"].get(brick_key)
    try:
        # Set degree range and safety - only once per servo ideally
        brick.set_degree(ch, s["min_cdeg"], s["max_cdeg"])
        brick.set_pulse_width(ch, 500, 2500)
        brick.set_period(ch, 20000)
        brick.set_position(ch, target_cdeg)
        with state_lock:
            s["position_cdeg"] = target_cdeg
        return {"ok": True, "position_cdeg": target_cdeg}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def set_enable(name, enable):
    with state_lock:
        s = state["servos"].get(name)
        if not s:
            return {"ok": False, "error": "unknown servo"}
        ch = s["channel"]
        brick_key = s["brick"]
        if state["mock"] or not state["connected"]:
            s["enabled"] = bool(enable)
            return {"ok": True}
        brick = state["bricks"].get(brick_key)
    try:
        brick.set_enable(ch, bool(enable))
        with state_lock:
            s["enabled"] = bool(enable)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# Flask routes
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/calibrate")
def calibrate_page():
    return send_from_directory("static", "calibrate.html")

@app.route("/config.json")
def config_json():
    # Return the mapping and some meta
    with state_lock:
        servos = state["servos"]
    # Build a compact payload: name -> meta
    payload = {}
    for name, meta in servos.items():
        payload[name] = {
            "brick": meta["brick"],
            "channel": meta["channel"],
            "enabled": meta["enabled"],
            "position_deg": meta["position_cdeg"] / 100.0,
            "min_deg": meta["min_cdeg"] / 100.0,
            "max_deg": meta["max_cdeg"] / 100.0
        }
    return jsonify({"servos": payload, "connected": state["connected"], "mock": state["mock"]})

# Socket.IO events
@socketio.on("connect")
def handle_connect():
    emit("status", {"connected": state["connected"], "mock": state["mock"]})
    emit("config", {"servos": {k: {
        "brick": v["brick"],
        "channel": v["channel"],
        "enabled": v["enabled"],
        "position_deg": v["position_cdeg"] / 100.0,
        "min_deg": v["min_cdeg"] / 100.0,
        "max_deg": v["max_cdeg"] / 100.0
    } for k, v in state["servos"].items()}})

@socketio.on("set_position")
def on_set_position(data):
    # data: {name, degree}
    name = data.get("name")
    deg = float(data.get("degree", 0.0))
    res = safe_set_position(name, deg)
    emit("position_update", {"name": name, "ok": res.get("ok"), "position_deg": res.get("position_cdeg", 0) / 100.0}, broadcast=True)

@socketio.on("set_enable")
def on_set_enable(data):
    name = data.get("name")
    enable = bool(data.get("enable"))
    res = set_enable(name, enable)
    emit("enable_update", {"name": name, "ok": res.get("ok"), "enabled": enable}, broadcast=True)

@socketio.on("emergency_stop")
def on_emergency_stop():
    # disable all servos immediately
    results = {}
    with state_lock:
        names = list(state["servos"].keys())
    for name in names:
        r = set_enable(name, False)
        results[name] = r
    emit("emergency_ack", {"ok": True}, broadcast=True)

@socketio.on("get_positions")
def on_get_positions():
    with state_lock:
        payload = {n: s["position_cdeg"] / 100.0 for n, s in state["servos"].items()}
    emit("positions", payload)

@socketio.on("enable_all")
def on_enable_all(data):
    enable = bool(data.get("enable", True))
    with state_lock:
        names = list(state["servos"].keys())
    for name in names:
        set_enable(name, enable)
    emit("all_enabled", {"enabled": enable}, broadcast=True)

@socketio.on("zero_all")
def on_zero_all():
    with state_lock:
        names = list(state["servos"].keys())
    for name in names:
        safe_set_position(name, 0.0)
    emit("all_zeroed", {}, broadcast=True)

@socketio.on("wave_motion")
def on_wave_motion():
    """Execute a waving motion sequence"""
    import threading
    
    def wave_sequence():
        # Wave sequence - adjust servo names and angles for your robot
        # This assumes a right hand wave motion
        wave_servos = {
            "Schulter Horizontal": [-45, 0, -45, 0, -45, 0],  # Shoulder side to side
            "Ellbogen": [90, 45, 90, 45, 90, 0],  # Elbow bend
            "Handgelenk": [30, -30, 30, -30, 30, 0],  # Wrist rotate
            "Zeigefinger": [45, 0, 45, 0, 45, 0],  # Fingers wave
            "Mittelfinger": [45, 0, 45, 0, 45, 0],
            "Ringfinger": [45, 0, 45, 0, 45, 0],
            "Kleiner Finger": [45, 0, 45, 0, 45, 0],
        }
        
        # Execute wave sequence
        for step in range(6):
            for servo_name, angles in wave_servos.items():
                if servo_name in state["servos"]:
                    safe_set_position(servo_name, angles[step])
            time.sleep(0.4)  # Delay between steps
        
        socketio.emit("wave_complete", {}, broadcast=True)
    
    # Run wave in background thread
    thread = threading.Thread(target=wave_sequence, daemon=True)
    thread.start()
    emit("wave_started", {}, broadcast=True)

# Startup
if __name__ == "__main__":
    load_config()
    try:
        connect_tinker()
        print(f"✓ Connected to Tinkerforge at {HOST}:{PORT_TF}")
    except Exception as e:
        print(f"⚠ Could not connect to Tinkerforge: {e}")
        state["connected"] = False
    
    print(f"✓ Server starting on http://0.0.0.0:5001")
    print(f"  Servos loaded: {len(state['servos'])}")
    print(f"  Mode: {'Mock' if state['mock'] else 'Hardware'}")
    
    # Note: eventlet or gevent recommended for production SocketIO
    socketio.run(app, host="0.0.0.0", port=5001, debug=False)
