import { SUPABASE_CONFIG } from "./supabase-config.js";

const DB_NAME = "metronomo-live";
const DB_VERSION = 2;
const STORE = "songs";
const SYNC_RETRY_MS = 45000;
const STORAGE_KEYS = {
  bankView: "bankView",
  midiMap: "midiMap",
  setlistOrder: "setlistOrder",
  audioOutput: "audioOutput",
};

const subdivisionLabels = {
  quarter: "negra",
  eighth: "corchea",
  dottedQuarter: "negra con punto",
  dottedEighth: "corchea con punto",
  sixteenth: "semicorchea",
};

const noteValues = {
  quarter: 1,
  eighth: 0.5,
  dottedQuarter: 1.5,
  dottedEighth: 0.75,
  sixteenth: 0.25,
};

const midiActions = [
  ["toggle", "Iniciar"],
  ["next", "Siguiente"],
  ["prev", "Anterior"],
  ["tap", "Tap tempo"],
  ["nudgeUp", "Nudge +"],
  ["nudgeDown", "Nudge −"],
];

const seedSongs = [
  {
    id: crypto.randomUUID(),
    name: "Danzando",
    artist: "Gateway Worship Español",
    bpm: 95,
    signature: "4/4",
    subdivision: "eighth",
    accents: [2, 1, 1, 1],
  },
];

const el = {
  songTitle: document.querySelector("#songTitle"),
  currentArtist: document.querySelector("#currentArtist"),
  currentPosition: document.querySelector("#currentPosition"),
  nextReadout: document.querySelector("#nextReadout"),
  storageStatus: document.querySelector("#storageStatus"),
  midiStatus: document.querySelector("#midiStatus"),
  bpmReadout: document.querySelector("#bpmReadout"),
  signatureReadout: document.querySelector("#signatureReadout"),
  subdivisionReadout: document.querySelector("#subdivisionReadout"),
  pendingReadout: document.querySelector("#pendingReadout"),
  beatGrid: document.querySelector("#beatGrid"),
  togglePlay: document.querySelector("#togglePlay"),
  togglePlayLabel: document.querySelector("#togglePlayLabel"),
  prevSong: document.querySelector("#prevSong"),
  nextSong: document.querySelector("#nextSong"),
  tapTempo: document.querySelector("#tapTempo"),
  bpmInput: document.querySelector("#bpmInput"),
  signatureInput: document.querySelector("#signatureInput"),
  subdivisionInput: document.querySelector("#subdivisionInput"),
  customBeatsWrap: document.querySelector("#customBeatsWrap"),
  customBeats: document.querySelector("#customBeats"),
  accentControls: document.querySelector("#accentControls"),
  songList: document.querySelector("#songList"),
  songSearch: document.querySelector("#songSearch"),
  songBankList: document.querySelector("#songBankList"),
  bankSearch: document.querySelector("#bankSearch"),
  bankActiveView: document.querySelector("#bankActiveView"),
  bankArchivedView: document.querySelector("#bankArchivedView"),
  songForm: document.querySelector("#songForm"),
  songId: document.querySelector("#songId"),
  nameInput: document.querySelector("#nameInput"),
  artistInput: document.querySelector("#artistInput"),
  formBpmInput: document.querySelector("#formBpmInput"),
  formSignatureInput: document.querySelector("#formSignatureInput"),
  formSubdivisionInput: document.querySelector("#formSubdivisionInput"),
  cancelEdit: document.querySelector("#cancelEdit"),
  addSongForm: document.querySelector("#addSongForm"),
  addNameInput: document.querySelector("#addNameInput"),
  addArtistInput: document.querySelector("#addArtistInput"),
  addBpmInput: document.querySelector("#addBpmInput"),
  addSignatureInput: document.querySelector("#addSignatureInput"),
  addSubdivisionInput: document.querySelector("#addSubdivisionInput"),
  deleteSong: document.querySelector("#deleteSong"),
  enableMidi: document.querySelector("#enableMidi"),
  midiMap: document.querySelector("#midiMap"),
  audioOutputButton: document.querySelector("#audioOutputButton"),
  audioOutputLabel: document.querySelector("#audioOutputLabel"),
  audioOutputMenu: document.querySelector("#audioOutputMenu"),
  chooseAudioOutput: document.querySelector("#chooseAudioOutput"),
  audioOutputDevices: document.querySelector("#audioOutputDevices"),
  tempoUp: document.querySelector("#tempoUp"),
  tempoDown: document.querySelector("#tempoDown"),
  saveTempoButton: document.querySelector("#saveTempoButton"),
  nudgeUp: document.querySelector("#nudgeUp"),
  nudgeDown: document.querySelector("#nudgeDown"),
  tempoScaleControls: document.querySelector("#tempoScaleControls"),
};

let db;
let songs = [];
let archivedSongs = [];
let selectedId = null;
let pendingId = null;
let search = "";
let bankSearch = "";
let bankView = ["active", "archived"].includes(localStorage.getItem(STORAGE_KEYS.bankView))
  ? localStorage.getItem(STORAGE_KEYS.bankView)
  : "active";
let draggedSongId = null;
let learningAction = null;
const storedMidiMap = readJsonStorage(STORAGE_KEYS.midiMap, {}, isPlainObject);
const storedSetlistOrder = readJsonStorage(STORAGE_KEYS.setlistOrder, [], Array.isArray);
let midiMap = storedMidiMap.value;
let setlistOrder = storedSetlistOrder.value;
let setlistHasStoredOrder = storedSetlistOrder.valid;
let tapHistory = [];
const storedAudioOutput = parseStoredAudioOutput();
let syncTimer = null;
let syncInFlight = false;
let pendingStageSaveTimer = null;

const audioOutputState = {
  supported: false,
  selectedId: storedAudioOutput.id || "",
  selectedLabel: storedAudioOutput.label || "Sistema",
  devices: [],
  menuOpen: false,
};

const state = {
  bpm: 120,
  signature: "4/4",
  customBeats: 5,
  subdivision: "quarter",
  accents: [2, 1, 1, 1],
  tempoScale: 1,
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonStorage(key, fallback, validate = () => true) {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return { value: fallback, found: false, valid: false };
  }

  try {
    const value = JSON.parse(raw);
    if (!validate(value)) throw new Error(`Invalid ${key}`);
    return { value, found: true, valid: true };
  } catch {
    localStorage.removeItem(key);
    return { value: fallback, found: true, valid: false };
  }
}

class AudioMetronome {
  constructor() {
    this.ctx = null;
    this.worker = null;
    this.isRunning = false;
    this.isStarting = false;
    this.currentBeat = 0;
    this.nextNoteTime = 0;
    this.lookaheadMs = 20;
    this.scheduleAheadTime = 0.1;
    this.startDelay = 0.045;
    this.transportId = 0;
    this.scheduledClicks = new Set();
    this.visualTimers = new Set();
    this.pendingCommitTimer = null;
    this.outputDeviceId = audioOutputState.selectedId;
    this.masterGain = null;
    this.compressor = null;
  }

  async init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: "interactive" });
      this.createOutputBus();
      this.worker = this.createWorker();
      this.worker.onmessage = () => this.scheduler();
      try {
        await this.applyOutputDevice();
      } catch {
        this.outputDeviceId = "";
        audioOutputState.selectedId = "";
        audioOutputState.selectedLabel = "Sistema";
        saveAudioOutputPreference();
        renderAudioOutput();
      }
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  createOutputBus() {
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.masterGain.gain.value = 0.86;
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.07;
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
  }

  canSelectOutput() {
    return Boolean(this.ctx && typeof this.ctx.setSinkId === "function");
  }

  async setOutputDevice(deviceId = "") {
    this.outputDeviceId = deviceId;
    return this.applyOutputDevice();
  }

  async applyOutputDevice() {
    if (!this.canSelectOutput()) return false;
    await this.ctx.setSinkId(this.outputDeviceId || "");
    return true;
  }

  createWorker() {
    const blob = new Blob(
      [
        `let timer = null;
        self.onmessage = (event) => {
          if (event.data.type === "start") {
            clearInterval(timer);
            timer = setInterval(() => self.postMessage("tick"), event.data.lookahead);
          }
          if (event.data.type === "stop") clearInterval(timer);
        };`,
      ],
      { type: "application/javascript" },
    );
    return new Worker(URL.createObjectURL(blob));
  }

  async start() {
    if (this.isRunning || this.isStarting) return;
    this.isStarting = true;
    try {
      await this.init();
      this.transportId += 1;
      this.clearPendingCommitTimer();
      this.currentBeat = 0;
      this.nextNoteTime = this.ctx.currentTime + this.startDelay;
      this.isRunning = true;
      this.worker.postMessage({ type: "start", lookahead: this.lookaheadMs });
      this.scheduler();
      renderTransport();
    } finally {
      this.isStarting = false;
    }
  }

  stop() {
    if (!this.isRunning && !this.isStarting) return;
    this.transportId += 1;
    this.isRunning = false;
    this.isStarting = false;
    this.worker?.postMessage({ type: "stop" });
    this.stopScheduledNodes();
    this.clearVisualTimers();
    this.clearPendingCommitTimer();
    this.currentBeat = 0;
    renderAll();
    renderBeats(-1);
  }

  toggle() {
    this.isRunning ? this.stop() : this.start();
  }

  scheduler() {
    if (!this.isRunning || !this.ctx) return;
    const transportId = this.transportId;
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleBeat(this.currentBeat, this.nextNoteTime, transportId);
      this.advanceNote();
    }
  }

  scheduleBeat(beat, time, transportId) {
    const accent = state.accents[beat] ?? 1;
    this.scheduleVisualBeat(beat, time, transportId);
    if (accent !== 0) {
      this.playClick(accent, time);
    }

    this.scheduleSubdivisionClicks(time);
  }

  scheduleSubdivisionClicks(time) {
    const steps = getSubdivisionStepCount();
    if (steps <= 1) return;

    const interval = getBeatSeconds() / steps;
    for (let step = 1; step < steps; step += 1) {
      this.playClick(3, time + interval * step);
    }
  }

  playClick(accent, time) {
    const osc = this.ctx.createOscillator();
    const shaper = this.ctx.createWaveShaper();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    const profile = accent === 2
      ? {
          peak: 0.52,
          startFrequency: 2380,
          endFrequency: 1220,
          filterFrequency: 2350,
          filterQ: 1.9,
          attack: 0.0025,
          hold: 0.005,
          decay: 0.042,
        }
      : accent === 3
        ? {
            peak: 0.12,
            startFrequency: 1420,
            endFrequency: 920,
            filterFrequency: 1460,
            filterQ: 1.08,
            attack: 0.0015,
            hold: 0.002,
            decay: 0.026,
          }
      : {
          peak: 0.27,
          startFrequency: 1980,
          endFrequency: 1320,
          filterFrequency: 2040,
          filterQ: 1.28,
          attack: 0.0018,
          hold: 0.0028,
          decay: 0.024,
        };
    const holdTime = time + profile.attack + profile.hold;
    const endTime = holdTime + profile.decay;

    osc.type = "sine";
    osc.frequency.setValueAtTime(profile.startFrequency, time);
    osc.frequency.exponentialRampToValueAtTime(profile.endFrequency, endTime);
    shaper.curve = this.createSoftClipCurve();
    shaper.oversample = "2x";
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(profile.filterFrequency, time);
    filter.Q.value = profile.filterQ;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(profile.peak, time + profile.attack);
    gain.gain.setValueAtTime(profile.peak, holdTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
    gain.gain.setValueAtTime(0, endTime + 0.01);

    osc.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain || this.ctx.destination);
    const click = this.trackScheduledClick([osc, shaper, filter, gain]);
    osc.start(time);
    osc.stop(endTime + 0.012);
    osc.onended = () => this.releaseScheduledClick(click);
    click.cleanupTimer = window.setTimeout(
      () => this.releaseScheduledClick(click),
      Math.max(0, (endTime - this.ctx.currentTime) * 1000) + 120,
    );
  }

  createSoftClipCurve() {
    if (this.softClipCurve) return this.softClipCurve;
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const x = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(0.95 * x);
    }
    this.softClipCurve = curve;
    return curve;
  }

  scheduleVisualBeat(beat, time, transportId) {
    const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      this.visualTimers.delete(timer);
      if (this.isRunning && this.transportId === transportId) {
        renderBeats(beat);
      }
    }, delay);
    this.visualTimers.add(timer);
  }

  advanceNote() {
    const beats = getBeatCount();
    const beatLength = getBeatSeconds();
    this.nextNoteTime += beatLength;
    this.currentBeat += 1;

    if (this.currentBeat >= beats) {
      this.currentBeat = 0;
      if (pendingId) {
        commitPendingSongAtBoundary(this.nextNoteTime);
      }
    }
  }

  trackScheduledClick(nodes) {
    const click = { nodes };
    this.scheduledClicks.add(click);
    return click;
  }

  releaseScheduledClick(click) {
    if (click.cleanupTimer) {
      window.clearTimeout(click.cleanupTimer);
      click.cleanupTimer = null;
    }
    click.nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        // Some nodes may already be disconnected by browser cleanup.
      }
    });
    this.scheduledClicks.delete(click);
  }

  stopScheduledNodes() {
    this.scheduledClicks.forEach((click) => {
      const [source] = click.nodes;
      try {
        source.stop(0);
      } catch {
        // Already stopped sources are safe to release below.
      }
      this.releaseScheduledClick(click);
    });
    this.scheduledClicks.clear();
  }

  clearVisualTimers() {
    this.visualTimers.forEach((timer) => window.clearTimeout(timer));
    this.visualTimers.clear();
  }

  clearPendingCommitTimer() {
    if (this.pendingCommitTimer) {
      window.clearTimeout(this.pendingCommitTimer);
      this.pendingCommitTimer = null;
    }
  }
}

const metronome = new AudioMetronome();

function getEffectiveBpm() {
  return Math.min(260, Math.max(30, state.bpm * state.tempoScale + (state.nudge || 0)));
}

function getBeatSeconds() {
  const secondsPerQuarter = 60 / getEffectiveBpm();
  return secondsPerQuarter * getBeatNoteValue();
}

function getBeatNoteValue(signature = state.signature) {
  if (signature === "custom") return 1;
  const denominator = Number(signature.split("/")[1]) || 4;
  return 4 / denominator;
}

function getSubdivisionStepCount() {
  const beatValue = getBeatNoteValue();
  const subdivisionValue = noteValues[state.subdivision] || beatValue;
  if (subdivisionValue >= beatValue) return 1;
  return Math.max(1, Math.round(beatValue / subdivisionValue));
}

function getBeatCount(signature = state.signature) {
  if (signature === "custom") return Number(state.customBeats) || 4;
  return Number(signature.split("/")[0]) || 4;
}

function getSongBeatCount(song) {
  if (song.signature === "custom") return Number(song.custom_beats || song.customBeats || state.customBeats) || 4;
  return getBeatCount(song.signature);
}

function normalizeAccents(beats, existing = state.accents) {
  return Array.from({ length: beats }, (_, index) => existing[index] ?? (index === 0 ? 2 : 1));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const nextDb = request.result;
      if (!nextDb.objectStoreNames.contains(STORE)) {
        nextDb.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllSongs() {
  return new Promise((resolve, reject) => {
    const request = tx().getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getActiveSongs() {
  const records = await getAllSongs();
  return records.filter((song) => song.is_active !== false && song.sync_status !== "deleted");
}

async function getArchivedSongs() {
  const records = await getAllSongs();
  return records.filter((song) => song.is_active === false || song.sync_status === "deleted");
}

function saveSongRecord(song) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").put(song);
    request.onsuccess = () => resolve(song);
    request.onerror = () => reject(request.error);
  });
}

function deleteSongRecord(id) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearSongRecords() {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function normalizeSongRecord(song, syncStatus = song.sync_status || "dirty") {
  const signature = song.signature || "4/4";
  const beats = getBeatCount(signature);
  return {
    id: song.id || crypto.randomUUID(),
    name: (song.name || "").trim(),
    artist: (song.artist || "").trim(),
    bpm: Number(song.bpm) || 120,
    signature,
    custom_beats: song.custom_beats ?? song.customBeats ?? (signature === "custom" ? beats : null),
    subdivision: song.subdivision || "quarter",
    accents: normalizeAccents(beats, song.accents),
    notes: song.notes || "",
    is_active: song.is_active !== false,
    created_at: song.created_at || new Date().toISOString(),
    updated_at: song.updated_at || new Date().toISOString(),
    sync_status: syncStatus,
  };
}

async function ensureSeedData() {
  songs = await getActiveSongs();
  archivedSongs = await getArchivedSongs();
  if (songs.length) return;
  await Promise.all(seedSongs.map((song) => saveSongRecord(normalizeSongRecord(song, "dirty"))));
  songs = await getActiveSongs();
  archivedSongs = await getArchivedSongs();
}

function setStorageStatus(text) {
  el.storageStatus.textContent = text;
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = SUPABASE_CONFIG.url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function toSupabaseSong(song) {
  const normalized = normalizeSongRecord(song, song.sync_status);
  return {
    id: normalized.id,
    name: normalized.name,
    artist: normalized.artist,
    bpm: normalized.bpm,
    signature: normalized.signature,
    custom_beats: normalized.custom_beats,
    subdivision: normalized.subdivision,
    accents: normalized.accents,
    notes: normalized.notes,
    is_active: normalized.is_active,
  };
}

function toLocalSong(row, syncStatus = "synced") {
  return normalizeSongRecord(
    {
      id: row.id,
      name: row.name,
      artist: row.artist,
      bpm: row.bpm,
      signature: row.signature,
      custom_beats: row.custom_beats,
      subdivision: row.subdivision,
      accents: row.accents,
      notes: row.notes,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    syncStatus,
  );
}

async function fetchSupabaseSongs() {
  const table = SUPABASE_CONFIG.table;
  const query = `${table}?select=*&order=name.asc`;
  const rows = await supabaseRequest(query);
  return rows.map((row) => toLocalSong(row, "synced"));
}

async function upsertSupabaseSong(song) {
  const table = SUPABASE_CONFIG.table;
  const rows = await supabaseRequest(`${table}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(toSupabaseSong(song)),
  });
  return toLocalSong(rows[0], "synced");
}

async function archiveSupabaseSong(id) {
  const table = SUPABASE_CONFIG.table;
  const rows = await supabaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ is_active: false }),
  });
  return rows[0] ? toLocalSong(rows[0], "synced") : null;
}

async function deleteSupabaseSong(id) {
  const table = SUPABASE_CONFIG.table;
  await supabaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

function queueSupabaseSync(delay = 1200) {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncWithSupabase();
  }, delay);
}

async function saveSongLocal(song, { syncStatus = "dirty", queueSync = true } = {}) {
  const record = normalizeSongRecord(
    {
      ...song,
      updated_at: new Date().toISOString(),
    },
    syncStatus,
  );
  await saveSongRecord(record);
  if (queueSync) queueSupabaseSync();
  return record;
}

async function pushPendingLocalChanges() {
  const localSongs = await getAllSongs();
  const pending = localSongs.filter((song) =>
    ["dirty", "deleted", "purged"].includes(song.sync_status),
  );

  for (const song of pending) {
    if (song.sync_status === "purged") {
      await deleteSupabaseSong(song.id);
      await deleteSongRecord(song.id);
      continue;
    }

    if (song.sync_status === "deleted") {
      const archived = await archiveSupabaseSong(song.id);
      if (archived) await saveSongRecord(archived);
      continue;
    }

    const saved = await upsertSupabaseSong(song);
    await saveSongRecord(saved);
  }
}

async function replaceLocalSongsFromSupabase(remoteSongs) {
  const localSongs = await getAllSongs();
  const pending = localSongs.filter((song) =>
    ["dirty", "deleted", "purged"].includes(song.sync_status),
  );
  const localOnlyDirty = pending.filter((song) => song.sync_status === "dirty");

  await clearSongRecords();
  await Promise.all(remoteSongs.map((song) => saveSongRecord(song)));
  await Promise.all(localOnlyDirty.map(saveSongRecord));
}

async function refreshSongsFromLocal() {
  songs = await getActiveSongs();
  archivedSongs = await getArchivedSongs();
  reconcileSetlistOrder();
  if (!setlistOrder.includes(selectedId)) {
    selectedId = setlistOrder[0] || null;
    pendingId = null;
    if (selectedId) applySongState(songs.find((song) => song.id === selectedId));
  }
  renderAll();
}

async function syncWithSupabase() {
  if (syncInFlight) return;
  syncInFlight = true;
  setStorageStatus("Sincronizando");

  try {
    await pushPendingLocalChanges();
    const remoteSongs = await fetchSupabaseSongs();
    await replaceLocalSongsFromSupabase(remoteSongs);
    await refreshSongsFromLocal();
    setStorageStatus("Modo Online");
  } catch (error) {
    console.warn(error);
    setStorageStatus("Modo Local");
  } finally {
    syncInFlight = false;
  }
}

function reconcileSetlistOrder() {
  if (!songs.length) return;

  const songIds = new Set(songs.map((song) => song.id));
  const knownIds = setlistOrder.filter((id) => songIds.has(id));
  if (!setlistHasStoredOrder && !knownIds.length && songs.length) {
    setlistOrder = songs
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((song) => song.id);
  } else {
    setlistOrder = knownIds;
  }
  saveSetlistOrder();
}

function saveSetlistOrder() {
  setlistHasStoredOrder = true;
  localStorage.setItem(STORAGE_KEYS.setlistOrder, JSON.stringify(setlistOrder));
}

function applySong(id, quantized = false) {
  const song = songs.find((item) => item.id === id);
  if (!song) return;

  if (quantized && metronome.isRunning && selectedId !== id) {
    pendingId = id;
    renderAll();
    return;
  }

  applySongState(song);
  renderAll();
}

function applySongState(song) {
  selectedId = song.id;
  pendingId = null;
  state.bpm = Number(song.bpm);
  state.signature = song.signature;
  state.customBeats = getSongBeatCount(song);
  state.subdivision = song.subdivision;
  state.accents = normalizeAccents(getSongBeatCount(song), song.accents);
  fillForm(song);
}

function commitPendingSongAtBoundary(boundaryTime) {
  const song = songs.find((item) => item.id === pendingId);
  if (!song) return;

  applySongState(song);
  metronome.clearPendingCommitTimer();

  const delay = metronome.ctx ? Math.max(0, (boundaryTime - metronome.ctx.currentTime) * 1000) : 0;
  const transportId = metronome.transportId;
  metronome.pendingCommitTimer = window.setTimeout(() => {
    metronome.pendingCommitTimer = null;
    if (metronome.isRunning && metronome.transportId === transportId) {
      renderAll();
    }
  }, delay);
}

function selectRelative(direction) {
  const visible = filteredSongs();
  if (!visible.length) return;
  const currentIndex = Math.max(0, visible.findIndex((song) => song.id === selectedId));
  const nextIndex = (currentIndex + direction + visible.length) % visible.length;
  applySong(visible[nextIndex].id, true);
}

function filteredSongs() {
  const term = search.trim().toLowerCase();
  const byId = new Map(songs.map((song) => [song.id, song]));
  return setlistOrder
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((song) => `${song.name} ${song.artist}`.toLowerCase().includes(term));
}

function fillForm(song) {
  el.songId.value = song.id;
  el.nameInput.value = song.name;
  el.artistInput.value = song.artist || "";
  el.formBpmInput.value = song.bpm;
  el.formSignatureInput.value = song.signature || "4/4";
  el.formSubdivisionInput.value = song.subdivision;
}

function openEditForm(song) {
  fillForm(song);
  el.songForm.hidden = false;
  window.requestAnimationFrame(() => {
    el.songForm.scrollIntoView({ block: "start", behavior: "smooth" });
    try {
      el.nameInput.focus({ preventScroll: true });
    } catch {
      el.nameInput.focus();
    }
  });
}

function closeEditForm() {
  el.songId.value = "";
  el.nameInput.value = "";
  el.artistInput.value = "";
  el.formBpmInput.value = state.bpm;
  el.formSignatureInput.value = state.signature || "4/4";
  el.formSubdivisionInput.value = state.subdivision;
  el.songForm.hidden = true;
}

function renderAll() {
  renderStage();
  renderBeats();
  renderAccentControls();
  renderSongList();
  renderSongBank();
  renderMidiMap();
  renderTransport();
  renderTempoScale();
}

function renderStage() {
  const song = songs.find((item) => item.id === selectedId);
  const pending = songs.find((item) => item.id === pendingId);
  const list = filteredSongs();
  const currentIndex = list.findIndex((item) => item.id === selectedId);
  const nextSong = currentIndex >= 0 ? list[(currentIndex + 1) % list.length] : null;
  const bpm = getEffectiveBpm();

  el.songTitle.textContent = song ? song.name : "Selecciona una canción";
  el.currentArtist.textContent = song?.artist || "Sin artista";
  el.currentPosition.textContent =
    currentIndex >= 0 ? `${currentIndex + 1} de ${list.length}` : `0 de ${list.length}`;
  el.nextReadout.textContent = nextSong && nextSong.id !== selectedId ? `Siguiente: ${nextSong.name}` : "Siguiente: --";
  el.bpmReadout.textContent = String(Math.round(bpm));
  el.signatureReadout.textContent = state.signature === "custom" ? `${getBeatCount()}/4` : state.signature;
  el.subdivisionReadout.textContent = subdivisionLabels[state.subdivision];
  el.pendingReadout.textContent = pending ? `Cambio al cierre: ${pending.name}` : "";
  el.bpmInput.value = state.bpm;
  const hasUnsavedTempo = Boolean(song) && Number(song.bpm) !== Number(state.bpm);
  el.saveTempoButton.hidden = !hasUnsavedTempo;
  el.saveTempoButton.disabled = !hasUnsavedTempo;
  el.saveTempoButton.setAttribute("aria-hidden", String(!hasUnsavedTempo));
  el.signatureInput.value = state.signature;
  el.subdivisionInput.value = state.subdivision;
  el.customBeats.value = state.customBeats;
  el.customBeatsWrap.hidden = state.signature !== "custom";
}

function renderTransport() {
  el.togglePlayLabel.textContent = metronome.isRunning ? "Detener" : "Iniciar";
  const icon = el.togglePlay.querySelector(".material-symbols-rounded");
  if (icon) {
    icon.textContent = metronome.isRunning ? "stop" : "play_arrow";
  }
}

function renderTempoScale() {
  el.tempoScaleControls.querySelectorAll("button[data-scale]").forEach((button) => {
    const isActive = Number(button.dataset.scale) === state.tempoScale;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderBeats(activeBeat = null) {
  const beats = getBeatCount();
  el.beatGrid.style.setProperty("--beats", beats);
  el.beatGrid.replaceChildren(
    ...Array.from({ length: beats }, (_, index) => {
      const beat = document.createElement("div");
      beat.className = "beat";
      if (activeBeat === index) beat.classList.add("active");
      if (state.accents[index] === 0) beat.classList.add("muted");
      if (state.accents[index] === 2) beat.classList.add("strong");
      beat.textContent = index + 1;
      return beat;
    }),
  );
}

function renderAccentControls() {
  const beats = getBeatCount();
  state.accents = normalizeAccents(beats);
  el.accentControls.style.setProperty("--accent-count", beats);
  el.accentControls.replaceChildren(
    ...state.accents.map((accent, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "accent-button";
      if (accent === 0) button.classList.add("off");
      if (accent === 2) button.classList.add("strong");
      button.innerHTML = `<strong>${index + 1}</strong><span>${accentText(accent)}</span>`;
      button.addEventListener("click", () => {
        state.accents[index] = accent === 2 ? 1 : accent === 1 ? 0 : 2;
        persistCurrentSongFromStage();
        renderAll();
      });
      return button;
    }),
  );
}

function accentText(value) {
  if (value === 2) return "fuerte";
  if (value === 1) return "normal";
  return "off";
}

function renderSongList() {
  const list = filteredSongs();
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">playlist_add</span><span>Arrastra canciones desde el banco o usa el botón agregar al setlist.</span>`;
    el.songList.replaceChildren(empty);
    return;
  }

  el.songList.replaceChildren(
    ...list.map((song) => {
      const item = document.createElement("div");
      item.className = "song-item";
      item.draggable = true;
      item.dataset.songId = song.id;
      if (song.id === selectedId) item.classList.add("active");
      if (song.id === pendingId) item.classList.add("pending");
      item.innerHTML = `
        <div class="song-swipe">
          <span class="drag-handle material-symbols-rounded" aria-hidden="true">drag_indicator</span>
          <button class="song-main" type="button">
            <span>
              <span class="song-name">${escapeHtml(song.name)}</span>
              <span class="song-artist">${escapeHtml(song.artist || "Sin artista")}</span>
            </span>
            <span class="song-meta">${song.bpm} · ${song.signature}</span>
          </button>
        </div>
        <button class="song-remove" type="button" aria-label="Quitar ${escapeHtml(song.name)} del setlist">
          <span class="material-symbols-rounded" aria-hidden="true">delete</span>
        </button>
      `;
      const main = item.querySelector(".song-main");
      const removeButton = item.querySelector(".song-remove");
      main.addEventListener("click", () => {
        if (item.dataset.swipeLock === "true") return;
        if (item.classList.contains("reveal-remove")) {
          item.classList.remove("reveal-remove");
          return;
        }
        applySong(song.id, true);
      });
      main.addEventListener("dblclick", () => {
        openEditForm(song);
      });
      removeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        removeSongFromSetlist(song.id);
      });
      bindSetlistSwipe(item);
      item.addEventListener("dragstart", (event) => {
        if (event.target.closest(".song-remove")) {
          event.preventDefault();
          return;
        }
        draggedSongId = song.id;
        item.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", song.id);
      });
      item.addEventListener("dragend", () => {
        draggedSongId = null;
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (draggedSongId && draggedSongId !== song.id) item.classList.add("drop-target");
      });
      item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        item.classList.remove("drop-target");
        reorderSetlist(draggedSongId || event.dataTransfer.getData("text/plain"), song.id);
      });
      return item;
    }),
  );
}

function bindSetlistSwipe(item) {
  let startX = 0;
  let startY = 0;
  let swiping = false;

  item.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.target.closest("button")) return;
    startX = event.clientX;
    startY = event.clientY;
    swiping = false;
  });

  item.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || !startX) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) < 12 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    swiping = true;
    if (deltaX < -36) item.classList.add("reveal-remove");
    if (deltaX > 24) item.classList.remove("reveal-remove");
  });

  item.addEventListener("pointerup", () => {
    if (!swiping) return;
    item.dataset.swipeLock = "true";
    window.setTimeout(() => {
      delete item.dataset.swipeLock;
    }, 0);
  });
}

function removeSongFromSetlist(id) {
  const currentIndex = setlistOrder.indexOf(id);
  if (currentIndex < 0) return;

  const nextOrder = setlistOrder.filter((songId) => songId !== id);
  const nextSelectedId = nextOrder[currentIndex] || nextOrder[currentIndex - 1] || nextOrder[0] || null;
  const removedCurrent = selectedId === id;
  const removedPending = pendingId === id;

  setlistOrder = nextOrder;
  if (removedPending) pendingId = null;
  saveSetlistOrder();

  if (removedCurrent && nextSelectedId) {
    applySong(nextSelectedId, true);
    return;
  }

  if (removedCurrent) {
    selectedId = null;
    pendingId = null;
    if (metronome.isRunning) metronome.stop();
  }

  renderAll();
}

function reorderSetlist(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const nextOrder = setlistOrder.filter((id) => id !== sourceId);
  const targetIndex = nextOrder.indexOf(targetId);
  if (targetIndex < 0) return;
  nextOrder.splice(targetIndex, 0, sourceId);
  setlistOrder = nextOrder;
  saveSetlistOrder();
  renderAll();
}

function renderSongBank() {
  const term = bankSearch.trim().toLowerCase();
  el.bankActiveView?.classList.toggle("active", bankView === "active");
  el.bankArchivedView?.classList.toggle("active", bankView === "archived");

  const source = bankView === "archived" ? archivedSongs : songs;
  const list = source
    .filter((song) => `${song.name} ${song.artist}`.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact-empty";
    empty.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">search_off</span><span>${
      bankView === "archived" ? "No hay canciones archivadas." : "No hay canciones en el banco."
    }</span>`;
    el.songBankList.replaceChildren(empty);
    return;
  }

  el.songBankList.replaceChildren(
    ...list.map((song) => {
      const item = document.createElement("div");
      const isInSetlist = setlistOrder.includes(song.id);
      item.className = "bank-item";
      item.innerHTML =
        bankView === "archived"
          ? `
        <div>
          <strong>${escapeHtml(song.name)}</strong>
          <span>${escapeHtml(song.artist || "Sin artista")} · ${song.bpm} · ${song.signature}</span>
        </div>
        <div class="bank-actions">
          <button type="button" aria-label="Restaurar ${escapeHtml(song.name)}">
            <span class="material-symbols-rounded" aria-hidden="true">restore</span>
          </button>
          <button type="button" aria-label="Eliminar definitivamente ${escapeHtml(song.name)}">
            <span class="material-symbols-rounded" aria-hidden="true">delete_forever</span>
          </button>
        </div>
      `
          : `
        <div>
          <strong>${escapeHtml(song.name)}</strong>
          <span>${escapeHtml(song.artist || "Sin artista")} · ${song.bpm} · ${song.signature}</span>
        </div>
        <div class="bank-actions">
          <button type="button" aria-label="Editar ${escapeHtml(song.name)}">
            <span class="material-symbols-rounded" aria-hidden="true">edit</span>
          </button>
          <button type="button" aria-label="Agregar ${escapeHtml(song.name)} al setlist" ${isInSetlist ? "disabled" : ""}>
            <span class="material-symbols-rounded" aria-hidden="true">${isInSetlist ? "playlist_add_check" : "playlist_add"}</span>
          </button>
          <button type="button" aria-label="Archivar ${escapeHtml(song.name)}">
            <span class="material-symbols-rounded" aria-hidden="true">archive</span>
          </button>
        </div>
      `;

      if (bankView === "archived") {
        const [restoreButton, deleteButton] = item.querySelectorAll("button");
        restoreButton.addEventListener("click", () => restoreArchivedSong(song.id));
        deleteButton.addEventListener("click", () => permanentlyDeleteSong(song.id));
        return item;
      }

      const [editButton, addButton, archiveButton] = item.querySelectorAll("button");
      editButton.addEventListener("click", () => {
        openEditForm(song);
      });
      addButton.addEventListener("click", () => addSongToSetlist(song.id));
      archiveButton.addEventListener("click", () => archiveSongFromBank(song.id));
      return item;
    }),
  );
}

function addSongToSetlist(id) {
  if (setlistOrder.includes(id)) return;
  setlistOrder.push(id);
  saveSetlistOrder();
  renderAll();
}

async function archiveSongFromBank(id) {
  const song = songs.find((item) => item.id === id);
  if (!song) return;

  const archived = {
    ...song,
    is_active: false,
    sync_status: "deleted",
  };
  await saveSongRecord(normalizeSongRecord(archived, "deleted"));
  removeSongFromSetlist(id);
  songs = await getActiveSongs();
  if (selectedId === id) {
    selectedId = setlistOrder[0] || null;
    if (selectedId) applySongState(songs.find((item) => item.id === selectedId));
  }
  renderAll();
  setStorageStatus("Modo Local");
  queueSupabaseSync();
}

async function restoreArchivedSong(id) {
  const song = archivedSongs.find((item) => item.id === id);
  if (!song) return;

  await saveSongLocal(
    {
      ...song,
      is_active: true,
      sync_status: "dirty",
    },
    { queueSync: true },
  );
  songs = await getActiveSongs();
  archivedSongs = await getArchivedSongs();
  bankView = "active";
  localStorage.setItem(STORAGE_KEYS.bankView, bankView);
  renderAll();
  setStorageStatus("Modo Local");
}

async function permanentlyDeleteSong(id) {
  const song = archivedSongs.find((item) => item.id === id);
  const confirmed = window.confirm(`Eliminar definitivamente "${song?.name || "esta canción"}" del banco CBC CLICK?`);
  if (!confirmed) return;

  await saveSongRecord(
    normalizeSongRecord(
      {
        ...(song || { id }),
        is_active: false,
      },
      "purged",
    ),
  );
  archivedSongs = await getArchivedSongs();
  renderAll();
  setStorageStatus("Modo Local");
  queueSupabaseSync();
}

function renderMidiMap() {
  el.midiMap.replaceChildren(
    ...midiActions.map(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `${label}<small>${midiMap[action] || "Sin asignar"}</small>`;
      if (learningAction === action) button.classList.add("strong");
      button.addEventListener("click", () => {
        learningAction = action;
        renderMidiMap();
      });
      return button;
    }),
  );
}

function getCurrentStageSong({ includeTempo = false } = {}) {
  const current = songs.find((song) => song.id === selectedId);
  if (!current) return null;
  return {
    ...current,
    bpm: includeTempo ? state.bpm : current.bpm,
    signature: state.signature,
    custom_beats: state.signature === "custom" ? state.customBeats : null,
    subdivision: state.subdivision,
    accents: [...state.accents],
  };
}

async function persistCurrentSongFromStage({ includeTempo = false } = {}) {
  const current = songs.find((song) => song.id === selectedId);
  const staged = getCurrentStageSong({ includeTempo });
  if (!current || !staged) return;
  Object.assign(current, staged);
  window.clearTimeout(pendingStageSaveTimer);
  pendingStageSaveTimer = window.setTimeout(async () => {
    const saved = await saveSongLocal(current, { queueSync: true });
    Object.assign(current, saved);
  }, 250);
}

async function saveFormSong(event) {
  event.preventDefault();
  const id = el.songId.value;
  if (!id) return;
  const signature = el.formSignatureInput.value;
  const beats = getBeatCount(signature);
  const previous = songs.find((song) => song.id === id);
  const song = {
    ...previous,
    id,
    name: el.nameInput.value.trim(),
    artist: el.artistInput.value.trim(),
    bpm: Number(el.formBpmInput.value),
    signature,
    custom_beats: signature === "custom" ? previous?.custom_beats || getBeatCount(signature) : null,
    subdivision: el.formSubdivisionInput.value,
    accents: normalizeAccents(beats, previous?.accents),
  };

  await saveSongLocal(song, { queueSync: true });
  songs = await getActiveSongs();
  applySong(id);
  setStorageStatus("Modo Local");
}

async function addSong(event) {
  event.preventDefault();
  const id = crypto.randomUUID();
  const signature = el.addSignatureInput.value;
  const beats = getBeatCount(signature);
  const song = {
    id,
    name: el.addNameInput.value.trim(),
    artist: el.addArtistInput.value.trim(),
    bpm: Number(el.addBpmInput.value),
    signature,
    custom_beats: signature === "custom" ? beats : null,
    subdivision: el.addSubdivisionInput.value,
    accents: normalizeAccents(beats),
  };

  await saveSongLocal(song, { queueSync: true });
  songs = await getActiveSongs();
  el.addSongForm.reset();
  el.addBpmInput.value = 120;
  el.addSignatureInput.value = "4/4";
  el.addSubdivisionInput.value = "quarter";
  addSongToSetlist(id);
  applySong(id);
  setStorageStatus("Modo Local");
}

function handleTapTempo() {
  const now = performance.now();
  tapHistory = tapHistory.filter((item) => now - item < 2200);
  tapHistory.push(now);
  if (tapHistory.length < 2) return;

  const intervals = tapHistory.slice(1).map((time, index) => time - tapHistory[index]);
  const average = intervals.reduce((sum, item) => sum + item, 0) / intervals.length;
  state.bpm = Math.round(Math.min(260, Math.max(30, 60000 / average)));
  renderAll();
}

function updateTempoDraft() {
  state.bpm = Number(el.bpmInput.value);
  renderAll();
}

function updateStageSetting() {
  state.signature = el.signatureInput.value;
  state.customBeats = Number(el.customBeats.value);
  state.subdivision = el.subdivisionInput.value;
  state.accents = normalizeAccents(getBeatCount());
  persistCurrentSongFromStage();
  renderAll();
}

function adjustBpm(amount) {
  state.bpm = Math.min(260, Math.max(30, state.bpm + amount));
  renderAll();
}

async function saveTempoDraft() {
  const current = songs.find((song) => song.id === selectedId);
  const staged = getCurrentStageSong({ includeTempo: true });
  if (!current || !staged || Number(current.bpm) === Number(state.bpm)) return;
  window.clearTimeout(pendingStageSaveTimer);
  const saved = await saveSongLocal(staged, { queueSync: true });
  Object.assign(current, saved);
  setStorageStatus("Modo Local");
  renderAll();
}

function nudge(amount) {
  state.nudge = amount;
  renderStage();
  window.clearTimeout(nudge.timeout);
  nudge.timeout = window.setTimeout(() => {
    state.nudge = 0;
    renderStage();
  }, 650);
}

function setTempoScale(scale) {
  state.tempoScale = scale;
  renderStage();
  renderTempoScale();
}

async function enableMidi() {
  if (!navigator.requestMIDIAccess) {
    el.midiStatus.textContent = "MIDI no soportado";
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess();
    const bindInputs = () => {
      access.inputs.forEach((input) => {
        input.onmidimessage = handleMidiMessage;
      });
      el.midiStatus.textContent = `${access.inputs.size} entrada(s) MIDI`;
    };
    access.onstatechange = bindInputs;
    bindInputs();
  } catch {
    el.midiStatus.textContent = "Permiso MIDI rechazado";
  }
}

function handleMidiMessage(event) {
  const [status, data1, data2] = event.data;
  const command = status & 0xf0;
  if ((command !== 0x90 && command !== 0xb0) || data2 === 0) return;

  const signature = `${command.toString(16)}:${data1}`;
  if (learningAction) {
    midiMap[learningAction] = signature;
    localStorage.setItem(STORAGE_KEYS.midiMap, JSON.stringify(midiMap));
    learningAction = null;
    renderMidiMap();
    return;
  }

  const action = Object.entries(midiMap).find(([, value]) => value === signature)?.[0];
  runAction(action);
}

function runAction(action) {
  if (action === "toggle") metronome.toggle();
  if (action === "next") selectRelative(1);
  if (action === "prev") selectRelative(-1);
  if (action === "tap") handleTapTempo();
  if (action === "nudgeUp") nudge(3);
  if (action === "nudgeDown") nudge(-3);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function parseStoredAudioOutput() {
  return readJsonStorage(STORAGE_KEYS.audioOutput, {}, isPlainObject).value;
}

function detectAudioOutputSupport() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return Boolean(
    AudioContextClass &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.enumerateDevices === "function" &&
      (metronome.canSelectOutput() || "setSinkId" in AudioContextClass.prototype),
  );
}

function saveAudioOutputPreference() {
  localStorage.setItem(
    STORAGE_KEYS.audioOutput,
    JSON.stringify({
      id: audioOutputState.selectedId,
      label: audioOutputState.selectedLabel,
    }),
  );
}

function audioOutputName(label) {
  const clean = (label || "").trim();
  if (!clean || clean.toLowerCase() === "default") return "Sistema";
  return clean.replace(/\s*\([^)]+\)\s*$/g, "");
}

function setAudioOutputMenuOpen(isOpen) {
  audioOutputState.menuOpen = isOpen;
  if (!el.audioOutputMenu || !el.audioOutputButton) return;
  el.audioOutputMenu.hidden = !isOpen;
  el.audioOutputButton.setAttribute("aria-expanded", String(isOpen));
}

function renderAudioOutputDevices() {
  if (!el.audioOutputDevices) return;

  if (!audioOutputState.supported) {
    el.audioOutputDevices.innerHTML = `<p class="audio-output-note">Este navegador usa la salida del sistema.</p>`;
    return;
  }

  const customDevices = audioOutputState.devices.filter((device) => device.deviceId !== "default");
  if (!customDevices.length) {
    el.audioOutputDevices.innerHTML = `<p class="audio-output-note">Usa "Elegir salida" para autorizar dispositivos disponibles.</p>`;
    return;
  }

  el.audioOutputDevices.innerHTML = customDevices
    .map((device) => {
      const label = audioOutputName(device.label);
      const isActive = device.deviceId === audioOutputState.selectedId;
      return `
        <button
          type="button"
          class="audio-output-device${isActive ? " active" : ""}"
          data-audio-output="${escapeHtml(device.deviceId)}"
        >
          <span class="material-symbols-rounded" aria-hidden="true">speaker</span>
          ${escapeHtml(label)}
        </button>
      `;
    })
    .join("");
}

function renderAudioOutput() {
  audioOutputState.supported = detectAudioOutputSupport();
  if (!el.audioOutputButton || !el.audioOutputLabel) return;

  const label = audioOutputState.supported ? audioOutputState.selectedLabel : "Sistema";
  el.audioOutputLabel.textContent = `Salida · ${audioOutputName(label)}`;
  el.audioOutputButton.classList.toggle("unsupported", !audioOutputState.supported);
  el.audioOutputButton.title = audioOutputState.supported
    ? "Seleccionar salida de audio"
    : "Selector de salida no disponible en este navegador";

  if (el.chooseAudioOutput) {
    const canOpenPicker = Boolean(navigator.mediaDevices?.selectAudioOutput);
    el.chooseAudioOutput.disabled = !audioOutputState.supported || !canOpenPicker;
    el.chooseAudioOutput.hidden = !audioOutputState.supported;
  }

  renderAudioOutputDevices();
}

async function refreshAudioOutputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    audioOutputState.devices = [];
    renderAudioOutput();
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioOutputState.devices = devices.filter((device) => device.kind === "audiooutput" && device.deviceId);
  } catch {
    audioOutputState.devices = [];
  }

  renderAudioOutput();
}

async function fallbackToSystemOutput(message = "Usando salida del sistema") {
  audioOutputState.selectedId = "";
  audioOutputState.selectedLabel = "Sistema";
  saveAudioOutputPreference();

  if (metronome.canSelectOutput()) {
    try {
      await metronome.setOutputDevice("");
    } catch {
      // Keep the app audible through the browser default output.
    }
  }

  if (el.audioOutputButton) el.audioOutputButton.title = message;
  renderAudioOutput();
}

async function setAudioOutputDevice(deviceId = "", label = "Sistema") {
  if (!deviceId || deviceId === "default") {
    await fallbackToSystemOutput("Salida del sistema seleccionada");
    return;
  }

  if (!audioOutputState.supported) {
    await fallbackToSystemOutput("Selector de salida no disponible en este navegador");
    return;
  }

  try {
    await metronome.init();
    const applied = await metronome.setOutputDevice(deviceId);
    if (!applied) throw new Error("Audio output selection is not supported");
    audioOutputState.selectedId = deviceId;
    audioOutputState.selectedLabel = audioOutputName(label);
    saveAudioOutputPreference();
  } catch {
    await fallbackToSystemOutput("No se pudo cambiar la salida. Usando sistema.");
  }

  renderAudioOutput();
}

async function chooseBrowserAudioOutput() {
  if (!audioOutputState.supported || !navigator.mediaDevices?.selectAudioOutput) {
    await refreshAudioOutputDevices();
    return;
  }

  try {
    const device = await navigator.mediaDevices.selectAudioOutput();
    if (!device?.deviceId) return;
    await setAudioOutputDevice(device.deviceId, device.label || "Salida seleccionada");
    await refreshAudioOutputDevices();
  } catch {
    renderAudioOutput();
  }
}

function bindEvents() {
  el.togglePlay.addEventListener("click", () => metronome.toggle());
  el.prevSong.addEventListener("click", () => selectRelative(-1));
  el.nextSong.addEventListener("click", () => selectRelative(1));
  el.tapTempo.addEventListener("click", handleTapTempo);
  el.tempoUp.addEventListener("click", () => adjustBpm(1));
  el.tempoDown.addEventListener("click", () => adjustBpm(-1));
  el.saveTempoButton.addEventListener("click", saveTempoDraft);
  el.nudgeUp.addEventListener("pointerdown", () => nudge(3));
  el.nudgeDown.addEventListener("pointerdown", () => nudge(-3));
  el.tempoScaleControls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-scale]");
    if (!button) return;
    setTempoScale(Number(button.dataset.scale));
  });
  el.bpmInput.addEventListener("input", updateTempoDraft);
  el.signatureInput.addEventListener("change", updateStageSetting);
  el.subdivisionInput.addEventListener("change", updateStageSetting);
  el.customBeats.addEventListener("input", updateStageSetting);
  el.songSearch.addEventListener("input", () => {
    search = el.songSearch.value;
    renderSongList();
    renderStage();
  });
  el.bankSearch.addEventListener("input", () => {
    bankSearch = el.bankSearch.value;
    renderSongBank();
  });
  el.bankActiveView?.addEventListener("click", () => {
    bankView = "active";
    localStorage.setItem(STORAGE_KEYS.bankView, bankView);
    renderSongBank();
  });
  el.bankArchivedView?.addEventListener("click", () => {
    bankView = "archived";
    localStorage.setItem(STORAGE_KEYS.bankView, bankView);
    renderSongBank();
  });
  el.songForm.addEventListener("submit", saveFormSong);
  el.addSongForm.addEventListener("submit", addSong);
  el.cancelEdit.addEventListener("click", closeEditForm);
  el.deleteSong.addEventListener("click", async () => {
    if (!el.songId.value) return;
    const archivedId = el.songId.value;
    const song = songs.find((item) => item.id === archivedId);
    if (song) {
      await saveSongRecord(normalizeSongRecord({ ...song, is_active: false }, "deleted"));
    } else {
      await deleteSongRecord(archivedId);
    }
    songs = await getActiveSongs();
    setlistOrder = setlistOrder.filter((id) => id !== archivedId);
    saveSetlistOrder();
    closeEditForm();
    selectedId = setlistOrder[0] || null;
    if (selectedId) applySong(selectedId);
    else renderAll();
    setStorageStatus("Modo Local");
    queueSupabaseSync();
  });
  el.enableMidi.addEventListener("click", enableMidi);
  el.audioOutputButton?.addEventListener("click", async () => {
    setAudioOutputMenuOpen(!audioOutputState.menuOpen);
    if (audioOutputState.menuOpen) await refreshAudioOutputDevices();
  });
  el.chooseAudioOutput?.addEventListener("click", async () => {
    await chooseBrowserAudioOutput();
    setAudioOutputMenuOpen(false);
  });
  el.audioOutputMenu?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-audio-output]");
    if (!button) return;
    const deviceId = button.dataset.audioOutput || "";
    const device = audioOutputState.devices.find((item) => item.deviceId === deviceId);
    await setAudioOutputDevice(deviceId, device?.label || button.textContent || "Sistema");
    setAudioOutputMenuOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (!audioOutputState.menuOpen) return;
    if (event.target instanceof Element && event.target.closest("#audioOutputControl")) return;
    setAudioOutputMenuOpen(false);
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioOutputDevices);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
    if (isTyping) return;

    if (event.code === "Space") {
      event.preventDefault();
      metronome.toggle();
    }
    if (event.code === "Enter") {
      event.preventDefault();
      selectRelative(1);
    }
    if (event.code === "ArrowRight" || event.code === "ArrowDown") {
      event.preventDefault();
      selectRelative(1);
    }
    if (event.code === "ArrowLeft" || event.code === "ArrowUp") {
      event.preventDefault();
      selectRelative(-1);
    }
  });
}

async function init() {
  bindEvents();
  renderAudioOutput();
  await refreshAudioOutputDevices();
  db = await openDb();
  songs = await getActiveSongs();
  archivedSongs = await getArchivedSongs();
  if (!songs.length) {
    setStorageStatus("Modo Local");
  } else {
    setStorageStatus("Modo Local");
  }
  if (!songs.length && !navigator.onLine) await ensureSeedData();
  reconcileSetlistOrder();
  closeEditForm();
  if (setlistOrder[0]) {
    applySong(setlistOrder[0]);
  } else {
    renderAll();
  }
  syncWithSupabase();
  window.setInterval(() => syncWithSupabase(), SYNC_RETRY_MS);
  window.addEventListener("online", () => syncWithSupabase());

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js");
  }
}

init().catch((error) => {
  console.error(error);
  el.storageStatus.textContent = "Error de persistencia";
  songs = seedSongs;
  applySong(songs[0].id);
});
