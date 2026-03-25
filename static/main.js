// static/main.js — Pib Control Panel
const socket = io();

// UI elements
const statusBadge = document.getElementById("status");
const grid = document.getElementById("servo-grid");
const btnStop = document.getElementById("btn-stop");
const btnEnableAll = document.getElementById("btn-enable-all");
const btnDisableAll = document.getElementById("btn-disable-all");
const btnZeroAll = document.getElementById("btn-zero-all");
const btnWave = document.getElementById("btn-wave");
const btnRefresh = document.getElementById("btn-refresh");
const presetList = document.getElementById("preset-list");
const presetNameInput = document.getElementById("preset-name-input");
const savePresetBtn = document.getElementById("save-preset");
const deletePresetBtn = document.getElementById("delete-preset");
const loadPresetBtn = document.getElementById("load-preset");

let servos = {};

// Servo grouping (underscored names matching config)
const servoGroups = {
  "Daumen": { side: "right", part: "hand" },
  "Daumen_Gelenk": { side: "right", part: "hand" },
  "Handgelenk": { side: "right", part: "hand" },
  "Zeigefinger": { side: "right", part: "hand" },
  "Mittelfinger": { side: "right", part: "hand" },
  "Ringfinger": { side: "right", part: "hand" },
  "Kleiner_Finger": { side: "right", part: "hand" },
  "Ellenbogen": { side: "right", part: "arm" },
  "Unterarm": { side: "right", part: "arm" },
  "Oberarm": { side: "right", part: "arm" },
  "Schulter_Vertikal": { side: "right", part: "arm" },
  "Schulter_Vertikal_2": { side: "right", part: "arm" },
  "Schulter_Horizontal": { side: "right", part: "arm" },
  "Nacken": { side: "center", part: "head" }
};

function getGroupBadges(name) {
  const group = servoGroups[name];
  if (!group) return "";
  let b = "";
  if (group.side === "left") b += '<span class="group-badge group-left">L</span>';
  if (group.side === "right") b += '<span class="group-badge group-right">R</span>';
  if (group.part === "hand") b += '<span class="group-badge group-hand">Hand</span>';
  if (group.part === "arm") b += '<span class="group-badge group-arm">Arm</span>';
  if (group.part === "head") b += '<span class="group-badge group-head">Head</span>';
  return b;
}

function updateStatus(connected, mock) {
  if (mock) {
    statusBadge.innerHTML = '<span class="dot"></span> Mock Mode';
    statusBadge.className = "status-badge status-mock";
  } else if (connected) {
    statusBadge.innerHTML = '<span class="dot"></span> Connected';
    statusBadge.className = "status-badge status-connected";
  } else {
    statusBadge.innerHTML = '<span class="dot"></span> Disconnected';
    statusBadge.className = "status-badge status-disconnected";
  }
}

function createServoCard(name, meta) {
  const displayName = name.replace(/_/g, " ");
  const badges = getGroupBadges(name);

  const card = document.createElement("div");
  card.className = `servo-card ${meta.enabled ? '' : 'disabled'}`;
  card.dataset.servo = name;

  card.innerHTML = `
    <div class="servo-header">
      <span class="servo-name">${displayName}</span>
      <label class="toggle-switch">
        <input type="checkbox" class="enable-toggle" ${meta.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="servo-meta">
      ${badges}
      <span class="servo-chip">HAT ${meta.brick} · CH${meta.channel}</span>
    </div>
    <div class="position-display">
      <span class="position-value">${meta.position_deg.toFixed(1)}</span><span class="unit">°</span>
    </div>
    <div class="current-reading">
      <i class="bi bi-lightning-charge-fill"></i> <span class="current-value">0</span> mA
    </div>
    <div class="slider-row">
      <input type="range" class="range-dark slider"
             min="${meta.min_deg}" max="${meta.max_deg}" step="0.5"
             value="${meta.position_deg}" ${meta.enabled ? '' : 'disabled'}>
      <div class="slider-labels">
        <span>${meta.min_deg}°</span><span>${meta.max_deg}°</span>
      </div>
    </div>
    <div class="servo-actions">
      <input type="number" class="form-control-dark num-input position-input"
             value="${meta.position_deg.toFixed(1)}" step="0.5" ${meta.enabled ? '' : 'disabled'}>
      <button class="btn-glass btn-zero" title="Zero"><i class="bi bi-bullseye"></i></button>
      <button class="btn-glass btn-accent btn-fine" title="Fine tune"><i class="bi bi-sliders2"></i></button>
    </div>
  `;

  const slider = card.querySelector(".slider");
  const numInput = card.querySelector(".position-input");
  const posDisplay = card.querySelector(".position-value");
  const enable = card.querySelector(".enable-toggle");
  const zeroBtnEl = card.querySelector(".btn-zero");
  const fineBtnEl = card.querySelector(".btn-fine");
  const currentValue = card.querySelector(".current-value");

  slider.addEventListener("input", () => {
    const val = parseFloat(slider.value);
    numInput.value = val.toFixed(1);
    posDisplay.textContent = val.toFixed(1);
  });

  slider.addEventListener("change", () => {
    socket.emit("set_position", { name, degree: parseFloat(slider.value) });
  });

  numInput.addEventListener("change", () => {
    const deg = parseFloat(numInput.value);
    slider.value = deg;
    posDisplay.textContent = deg.toFixed(1);
    socket.emit("set_position", { name, degree: deg });
  });

  enable.addEventListener("change", () => {
    card.classList.add("card-pending");
    socket.emit("set_enable", { name, enable: enable.checked });
  });

  zeroBtnEl.addEventListener("click", () => {
    socket.emit("set_position", { name, degree: 0 });
  });

  fineBtnEl.addEventListener("click", () => {
    const cur = parseFloat(slider.value);
    const step = prompt(`Fine tune ${displayName}\nCurrent: ${cur}°\nEnter adjustment (±):`, "0");
    if (step !== null) {
      socket.emit("set_position", { name, degree: cur + parseFloat(step) });
    }
  });

  return { card, slider, numInput, posDisplay, enable, currentValue };
}

// ─── Socket Events ───
socket.on("connect", () => { console.log("Connected"); updateStatus(true, false); });
socket.on("disconnect", () => { console.log("Disconnected"); updateStatus(false, false); });
socket.on("reconnect", () => { console.log("Reconnected"); });
socket.on("status", (d) => updateStatus(d.connected, d.mock));

socket.on("config", (data) => {
  servos = data.servos;
  grid.innerHTML = "";

  const sorted = Object.keys(servos).sort((a, b) => {
    const ga = servoGroups[a]?.part || "z";
    const gb = servoGroups[b]?.part || "z";
    return ga !== gb ? ga.localeCompare(gb) : a.localeCompare(b);
  });

  for (const name of sorted) {
    const ui = createServoCard(name, servos[name]);
    grid.appendChild(ui.card);
    servos[name].ui = ui;
  }
});

socket.on("position_update", (d) => {
  const s = servos[d.name];
  if (!s?.ui) return;
  const v = d.position_deg || 0;
  s.ui.slider.value = v;
  s.ui.numInput.value = v.toFixed(1);
  s.ui.posDisplay.textContent = v.toFixed(1);
});

socket.on("enable_update", (d) => {
  const s = servos[d.name];
  if (!s?.ui) return;
  s.ui.card.classList.remove("card-pending");
  if (d.ok === false) {
    s.ui.card.classList.add("card-error");
    setTimeout(() => s.ui?.card.classList.remove("card-error"), 500);
  }
  s.ui.enable.checked = d.enabled;
  s.ui.card.classList.toggle("disabled", !d.enabled);
  s.ui.slider.disabled = !d.enabled;
  s.ui.numInput.disabled = !d.enabled;
});

socket.on("motor_enabled", (d) => {
  const s = servos[d.name];
  if (!s?.ui) return;
  s.ui.card.classList.remove("card-pending");
  if (d.ok === false) {
    s.ui.card.classList.add("card-error");
    setTimeout(() => s.ui?.card.classList.remove("card-error"), 500);
  }
  s.ui.enable.checked = d.enabled;
  s.ui.card.classList.toggle("disabled", !d.enabled);
  s.ui.slider.disabled = !d.enabled;
  s.ui.numInput.disabled = !d.enabled;

  const action = d.enabled ? "Enabling" : "Disabling";
  const btn = d.enabled ? btnEnableAll : btnDisableAll;
  btn.innerHTML = `<span class="spinner-sm"></span> ${action} ${d.progress}/${d.total}…`;
});

socket.on("enable_all_started", (d) => {
  btnEnableAll.disabled = true;
  btnDisableAll.disabled = true;
  const action = d.enabled ? "Enabling" : "Disabling";
  const btn = d.enabled ? btnEnableAll : btnDisableAll;
  btn.innerHTML = `<span class="spinner-sm"></span> ${action} 0/${d.total}…`;
});

socket.on("all_enabled", (d) => {
  btnEnableAll.disabled = false;
  btnDisableAll.disabled = false;
  btnEnableAll.innerHTML = '<i class="bi bi-play-circle-fill"></i> Enable All';
  btnDisableAll.innerHTML = '<i class="bi bi-pause-circle-fill"></i> Disable All';
  Object.values(servos).forEach(s => s.ui?.card.classList.remove("card-pending"));
});

socket.on("positions", (p) => {
  for (const [n, deg] of Object.entries(p)) {
    const s = servos[n];
    if (!s?.ui) continue;
    s.ui.slider.value = deg;
    s.ui.numInput.value = deg.toFixed(1);
    s.ui.posDisplay.textContent = deg.toFixed(1);
  }
});

socket.on("emergency_ack", () => {
  Object.values(servos).forEach(s => s.ui?.card.classList.remove("card-pending"));
  alert("Emergency stop executed. All servos disabled.");
});

socket.on("all_zeroed", () => {});

socket.on("wave_started", () => {
  btnWave.disabled = true;
  btnWave.innerHTML = '<span class="spinner-sm"></span> Waving…';
});

socket.on("wave_complete", () => {
  btnWave.disabled = false;
  btnWave.innerHTML = '<i class="bi bi-hand-index-fill"></i> Wave';
});

socket.on("current_update", (data) => {
  const cd = document.getElementById("current-display");
  const cv = document.getElementById("current-value");
  if (cd && cv) {
    cv.textContent = Math.round(data.total);
    cd.style.display = "inline-flex";
  }
  for (const [name, cur] of Object.entries(data.currents || {})) {
    if (servos[name]?.ui?.currentValue) {
      servos[name].ui.currentValue.textContent = Math.round(cur);
    }
  }
});

// ─── Button Handlers ───
btnStop?.addEventListener("click", () => {
  if (!confirm("⚠️ EMERGENCY STOP\n\nThis will immediately cut power to ALL servos.\nAre you sure?")) return;
  Object.values(servos).forEach(s => s.ui?.card.classList.add("card-pending"));
  socket.emit("emergency_stop");
});

btnEnableAll?.addEventListener("click", () => {
  Object.values(servos).forEach(s => s.ui?.card.classList.add("card-pending"));
  socket.emit("enable_all", { enable: true });
});

btnDisableAll?.addEventListener("click", () => {
  Object.values(servos).forEach(s => s.ui?.card.classList.add("card-pending"));
  socket.emit("enable_all", { enable: false });
});

btnZeroAll?.addEventListener("click", () => {
  if (!confirm("Move all servos to 0° position?")) return;
  socket.emit("zero_all");
});

btnWave?.addEventListener("click", () => socket.emit("wave_motion"));
btnRefresh?.addEventListener("click", () => socket.emit("get_positions"));

// ─── Presets ───
function loadPresets() {
  const raw = localStorage.getItem("humanoid_presets");
  return raw ? JSON.parse(raw) : {};
}

function savePresets(p) {
  localStorage.setItem("humanoid_presets", JSON.stringify(p));
}

function refreshPresetList() {
  const presets = loadPresets();
  presetList.innerHTML = '<option value="">Select a preset…</option>';
  for (const n of Object.keys(presets).sort()) {
    const o = document.createElement("option");
    o.value = n; o.textContent = n;
    presetList.appendChild(o);
  }
}

loadPresetBtn?.addEventListener("click", () => {
  const n = presetList.value;
  if (!n) { alert("Select a preset to load."); return; }
  const pose = loadPresets()[n];
  if (!pose) { alert("Preset not found."); return; }
  for (const [sn, deg] of Object.entries(pose)) {
    socket.emit("set_position", { name: sn, degree: deg });
  }
});

savePresetBtn?.addEventListener("click", () => {
  const n = presetNameInput.value.trim();
  if (!n) { alert("Enter a preset name."); return; }
  if (n.length > 50) { alert("Name too long (max 50 chars)."); return; }
  const pose = {};
  for (const sn of Object.keys(servos)) {
    if (servos[sn].ui) pose[sn] = parseFloat(servos[sn].ui.numInput.value);
  }
  const p = loadPresets();
  p[n] = pose;
  savePresets(p);
  refreshPresetList();
  presetNameInput.value = "";
  alert(`✓ Preset "${n}" saved!`);
});

deletePresetBtn?.addEventListener("click", () => {
  const n = presetList.value;
  if (!n) { alert("Select a preset to delete."); return; }
  if (!confirm(`Delete preset "${n}"?`)) return;
  const p = loadPresets();
  delete p[n];
  savePresets(p);
  refreshPresetList();
});

refreshPresetList();

// ─── Keyboard Shortcuts (Alt-based) ───
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.altKey && e.key === "e") { e.preventDefault(); btnStop.click(); }
  if (e.altKey && e.key === "z") { e.preventDefault(); btnZeroAll.click(); }
  if (e.altKey && e.key === "r") { e.preventDefault(); btnRefresh.click(); }
});

console.log("Pib Control Panel initialized");
