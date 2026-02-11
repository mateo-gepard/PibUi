// static/main.js
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

let servos = {}; // local copy

// Servo grouping logic
const servoGroups = {
  "Daumen": { side: "right", part: "hand" },
  "Handgelenk": { side: "right", part: "hand" },
  "Daumen Gelenk": { side: "right", part: "hand" },
  "Ellbogen": { side: "right", part: "arm" },
  "Zeigefinger": { side: "right", part: "hand" },
  "Unterarm": { side: "right", part: "arm" },
  "Mittelfinger": { side: "right", part: "hand" },
  "Hals": { side: "center", part: "head" },
  "Schulter Vertikal": { side: "right", part: "arm" },
  "Schulter Horizontal": { side: "right", part: "arm" },
  "Ringfinger": { side: "right", part: "hand" },
  "Bizeps": { side: "right", part: "arm" },
  "Kleiner Finger": { side: "right", part: "hand" },
  "Nacken": { side: "center", part: "head" }
};

function getGroupBadge(name) {
  const group = servoGroups[name];
  if (!group) return "";
  
  let badges = "";
  if (group.side === "left") badges += '<span class="group-badge group-left">LEFT</span>';
  if (group.side === "right") badges += '<span class="group-badge group-right">RIGHT</span>';
  if (group.part === "hand") badges += '<span class="group-badge group-hand">HAND</span>';
  if (group.part === "arm") badges += '<span class="group-badge group-arm">ARM</span>';
  if (group.part === "head") badges += '<span class="group-badge group-head">HEAD</span>';
  
  return badges;
}

function updateStatus(connected, mock) {
  const indicator = statusBadge.querySelector(".status-indicator");
  if (connected) {
    if (mock) {
      indicator.className = "status-indicator status-mock";
      statusBadge.innerHTML = '<span class="status-indicator status-mock"></span> Mock Mode';
      statusBadge.className = "badge bg-warning";
    } else {
      indicator.className = "status-indicator status-connected";
      statusBadge.innerHTML = '<span class="status-indicator status-connected"></span> Connected';
      statusBadge.className = "badge bg-success";
    }
  } else {
    indicator.className = "status-indicator status-disconnected";
    statusBadge.innerHTML = '<span class="status-indicator status-disconnected"></span> Not Connected';
    statusBadge.className = "badge bg-danger";
  }
}

function createServoCard(name, meta) {
  const col = document.createElement("div");
  col.className = "col-12 col-md-6 col-lg-4 col-xl-3";
  
  const groupBadges = getGroupBadge(name);
  
  col.innerHTML = `
    <div class="servo-card ${meta.enabled ? '' : 'disabled'}" data-servo="${name}">
      <div class="servo-title">
        <span>${name}</span>
        <div class="form-check form-switch mb-0">
          <input class="form-check-input enable-toggle" type="checkbox" ${meta.enabled ? 'checked' : ''}>
        </div>
      </div>
      <div class="servo-meta">
        ${groupBadges}
        <span>Brick ${meta.brick} • CH${meta.channel}</span>
      </div>
      
      <div class="position-display">
        <span class="position-value">${meta.position_deg.toFixed(1)}</span>°
      </div>
      
      <div class="current-display small text-muted mt-2" style="text-align: center;">
        <i class="bi bi-lightning-charge"></i> <span class="current-value">0</span> mA
      </div>
      
      <div class="slider-container">
        <input type="range" 
               class="form-range slider" 
               min="${meta.min_deg}" 
               max="${meta.max_deg}" 
               step="0.5" 
               value="${meta.position_deg}">
        <div class="d-flex justify-content-between small text-muted mt-1">
          <span>${meta.min_deg}°</span>
          <span>${meta.max_deg}°</span>
        </div>
      </div>
      
      <div class="d-flex gap-2 mt-3">
        <input type="number" 
               class="form-control form-control-sm input-number position-input" 
               value="${meta.position_deg.toFixed(1)}"
               step="0.5">
        <button class="btn btn-sm btn-outline-secondary btn-zero" title="Zero position">
          <i class="bi bi-bullseye"></i>
        </button>
        <button class="btn btn-sm btn-outline-primary btn-fine" title="Fine tune">
          <i class="bi bi-sliders"></i>
        </button>
      </div>
    </div>
  `;
  
  // Bind event handlers
  const card = col.querySelector(".servo-card");
  const slider = col.querySelector(".slider");
  const numInput = col.querySelector(".position-input");
  const posDisplay = col.querySelector(".position-value");
  const enable = col.querySelector(".enable-toggle");
  const btnZero = col.querySelector(".btn-zero");
  const btnFine = col.querySelector(".btn-fine");
  const currentValue = col.querySelector(".current-value");

  slider.addEventListener("input", () => {
    const val = parseFloat(slider.value);
    numInput.value = val.toFixed(1);
    posDisplay.textContent = val.toFixed(1);
  });
  
  slider.addEventListener("change", () => {
    const degree = parseFloat(slider.value);
    socket.emit("set_position", {name, degree});
  });
  
  numInput.addEventListener("change", () => {
    const degree = parseFloat(numInput.value);
    slider.value = degree;
    posDisplay.textContent = degree.toFixed(1);
    socket.emit("set_position", {name, degree});
  });
  
  enable.addEventListener("change", () => {
    const enabled = enable.checked;
    socket.emit("set_enable", {name, enable: enabled});
    card.classList.toggle("disabled", !enabled);
  });
  
  btnZero.addEventListener("click", () => {
    socket.emit("set_position", {name, degree: 0});
  });
  
  btnFine.addEventListener("click", () => {
    const current = parseFloat(slider.value);
    const step = prompt(`Fine tune ${name}\nCurrent: ${current}°\nEnter adjustment (±):`, "0");
    if (step !== null) {
      const newVal = current + parseFloat(step);
      socket.emit("set_position", {name, degree: newVal});
    }
  });

  return {col, slider, numInput, posDisplay, enable, card, currentValue};
}

socket.on("connect", () => {
  console.log("Socket connected");
});

socket.on("status", (data) => {
  updateStatus(data.connected, data.mock);
});

socket.on("config", (data) => {
  // Build UI
  servos = data.servos;
  grid.innerHTML = "";
  
  // Sort servos by group for better organization
  const sortedNames = Object.keys(servos).sort((a, b) => {
    const groupA = servoGroups[a]?.part || "z";
    const groupB = servoGroups[b]?.part || "z";
    if (groupA !== groupB) return groupA.localeCompare(groupB);
    return a.localeCompare(b);
  });
  
  for (const name of sortedNames) {
    const meta = servos[name];
    const card = createServoCard(name, meta);
    grid.appendChild(card.col);
    servos[name].ui = card;
  }
});

socket.on("position_update", (data) => {
  const {name, position_deg, ok} = data;
  if (!servos[name] || !servos[name].ui) return;
  
  const val = position_deg || 0;
  servos[name].ui.slider.value = val;
  servos[name].ui.numInput.value = val.toFixed(1);
  servos[name].ui.posDisplay.textContent = val.toFixed(1);
});

socket.on("enable_update", (data) => {
  const {name, enabled} = data;
  if (!servos[name] || !servos[name].ui) return;
  
  servos[name].ui.enable.checked = enabled;
  servos[name].ui.card.classList.toggle("disabled", !enabled);
});

socket.on("motor_enabled", (data) => {
  const {name, enabled, progress, total} = data;
  if (!servos[name] || !servos[name].ui) {
    console.warn(`motor_enabled: servo ${name} UI not found`);
    return;
  }
  
  // Update UI for this specific motor
  servos[name].ui.enable.checked = enabled;
  servos[name].ui.card.classList.toggle("disabled", !enabled);
  
  // Update button text with progress
  const action = enabled ? "Enabling" : "Disabling";
  if (enabled) {
    btnEnableAll.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${action} ${progress}/${total}...`;
  } else {
    btnDisableAll.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${action} ${progress}/${total}...`;
  }
  
  console.log(`Motor ${name} ${action} (${progress}/${total})`);
});

socket.on("enable_all_started", (data) => {
  const {enabled, total} = data;
  const action = enabled ? "Enabling" : "Disabling";
  
  // Disable buttons during operation
  btnEnableAll.disabled = true;
  btnDisableAll.disabled = true;
  
  if (enabled) {
    btnEnableAll.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${action} 0/${total}...`;
  } else {
    btnDisableAll.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${action} 0/${total}...`;
  }
  
  console.log(`Started ${action} ${total} servos with 3s delay...`);
});

socket.on("positions", (payload) => {
  for (const [name, deg] of Object.entries(payload)) {
    if (servos[name] && servos[name].ui) {
      servos[name].ui.slider.value = deg;
      servos[name].ui.numInput.value = deg.toFixed(1);
      servos[name].ui.posDisplay.textContent = deg.toFixed(1);
    }
  }
});

socket.on("emergency_ack", () => {
  alert("Emergency stop executed. All servos disabled.");
});

socket.on("all_enabled", (data) => {
  const enabled = data.enabled;
  
  // Re-enable buttons and restore text
  btnEnableAll.disabled = false;
  btnDisableAll.disabled = false;
  btnEnableAll.innerHTML = '<i class="bi bi-play-circle"></i> Enable All';
  btnDisableAll.innerHTML = '<i class="bi bi-pause-circle"></i> Disable All';
  
  // Update all servo cards
  for (const name of Object.keys(servos)) {
    if (servos[name].ui) {
      servos[name].ui.enable.checked = enabled;
      servos[name].ui.card.classList.toggle("disabled", !enabled);
    }
  }
  
  console.log(`All servos ${enabled ? 'enabled' : 'disabled'}`);
});

socket.on("all_zeroed", () => {
  // positions will be updated via position_update events
});

socket.on("wave_started", () => {
  btnWave.disabled = true;
  btnWave.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Waving...';
});

socket.on("wave_complete", () => {
  btnWave.disabled = false;
  btnWave.innerHTML = '<i class="bi bi-hand-index"></i> Wave';
  console.log("Wave motion completed");
});

socket.on("current_update", (data) => {
  // Update total current at top
  const currentDisplay = document.getElementById("current-display");
  const currentValue = document.getElementById("current-value");
  if (currentDisplay && currentValue) {
    currentValue.textContent = Math.round(data.total);
    currentDisplay.style.display = 'inline-block';
  }
  
  // Update current for each motor
  const {currents} = data;
  for (const [name, current] of Object.entries(currents)) {
    if (servos[name] && servos[name].ui && servos[name].ui.currentValue) {
      servos[name].ui.currentValue.textContent = Math.round(current);
    }
  }
});

// Button handlers
btnStop.addEventListener("click", () => {
  if (!confirm("⚠️ This will immediately cut power to ALL servos!\n\nAre you sure?")) return;
  socket.emit("emergency_stop");
});

btnEnableAll.addEventListener("click", () => {
  socket.emit("enable_all", {enable: true});
});

btnDisableAll.addEventListener("click", () => {
  socket.emit("enable_all", {enable: false});
});

btnZeroAll.addEventListener("click", () => {
  if (!confirm("Move all servos to 0° position?")) return;
  socket.emit("zero_all");
});

btnWave.addEventListener("click", () => {
  socket.emit("wave_motion");
});

btnRefresh.addEventListener("click", () => {
  socket.emit("get_positions");
});

// Preset management (localStorage)
function loadPresets() {
  const raw = localStorage.getItem("humanoid_presets");
  return raw ? JSON.parse(raw) : {};
}

function savePresets(p) { 
  localStorage.setItem("humanoid_presets", JSON.stringify(p)); 
}

function refreshPresetList() {
  const presets = loadPresets();
  presetList.innerHTML = '<option value="">Select a preset...</option>';
  
  for (const name of Object.keys(presets).sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    presetList.appendChild(opt);
  }
}

loadPresetBtn.addEventListener("click", () => {
  const name = presetList.value;
  if (!name) {
    alert("Please select a preset to load.");
    return;
  }
  
  const presets = loadPresets();
  const pose = presets[name];
  if (!pose) {
    alert("Preset not found.");
    return;
  }
  
  // Apply pose
  for (const [servoName, deg] of Object.entries(pose)) {
    socket.emit("set_position", {name: servoName, degree: deg});
  }
  
  console.log(`Loaded preset: ${name}`);
});

savePresetBtn.addEventListener("click", () => {
  const name = presetNameInput.value.trim();
  if (!name) {
    alert("Please enter a preset name.");
    return;
  }
  
  const pose = {};
  for (const servoName of Object.keys(servos)) {
    if (servos[servoName].ui) {
      pose[servoName] = parseFloat(servos[servoName].ui.numInput.value);
    }
  }
  
  const presets = loadPresets();
  presets[name] = pose;
  savePresets(presets);
  refreshPresetList();
  presetNameInput.value = "";
  
  console.log(`Saved preset: ${name}`);
  alert(`✓ Preset "${name}" saved successfully!`);
});

deletePresetBtn.addEventListener("click", () => {
  const name = presetList.value;
  if (!name) {
    alert("Please select a preset to delete.");
    return;
  }
  
  if (!confirm(`Delete preset "${name}"?`)) return;
  
  const presets = loadPresets();
  delete presets[name];
  savePresets(presets);
  refreshPresetList();
  
  console.log(`Deleted preset: ${name}`);
});

// Initialize
refreshPresetList();

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd + E = Emergency stop
  if ((e.ctrlKey || e.metaKey) && e.key === "e") {
    e.preventDefault();
    btnStop.click();
  }
  
  // Ctrl/Cmd + Z = Zero all
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    btnZeroAll.click();
  }
  
  // Ctrl/Cmd + R = Refresh
  if ((e.ctrlKey || e.metaKey) && e.key === "r") {
    e.preventDefault();
    btnRefresh.click();
  }
});

console.log("Humanoid Control Panel initialized");
