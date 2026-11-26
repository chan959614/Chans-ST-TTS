/**
 * ST Direct TTS — Settings persistence via SillyTavern.getContext().extensionSettings
 * Supports independent multi-profile management for TTS and LLM endpoints,
 * backward-compatible migration from v1.0.0, and two-mode factory reset.
 */

import {
  MODULE_NAME,
  createDefaultSettings,
  createLlmProfile,
  createTtsProfile,
} from './constants.js';

const LOCAL_FALLBACK_KEY = `${MODULE_NAME}_local_fallback_v1`;

const TTS_PROFILE_FIELDS = [
  'baseUrl',
  'apiKey',
  'model',
  'voice',
  'responseFormat',
  'speed',
  'pitch',
  'volume',
  'sendExtendedParams',
];

const LLM_PROFILE_FIELDS = ['baseUrl', 'apiKey', 'model'];

export function getSTContext() {
  if (typeof globalThis !== 'undefined' && globalThis.SillyTavern?.getContext) {
    return globalThis.SillyTavern.getContext();
  }
  return null;
}

export function isTauriTavern() {
  return Boolean(typeof globalThis !== 'undefined' && globalThis.__TAURITAVERN__);
}

export function mergeDefaults(target, defaults) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return structuredClone(defaults);
  }
  const out = target;
  for (const [key, defVal] of Object.entries(defaults)) {
    if (!(key in out) || out[key] === undefined) {
      out[key] = structuredClone(defVal);
    } else if (
      defVal &&
      typeof defVal === 'object' &&
      !Array.isArray(defVal) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      mergeDefaults(out[key], defVal);
    }
  }
  return out;
}

/**
 * Ensure ttsProfiles & llmProfiles are initialized and synced with settings.tts / settings.llm.
 * Seamlessly migrates v1.0.0 settings that had single tts/llm fields without losing credentials.
 */
export function ensureProfiles(settings) {
  // Clean up deprecated v1.0.0 field
  if (settings.llm && 'reuseTtsAuth' in settings.llm) {
    delete settings.llm.reuseTtsAuth;
  }

  // TTS profiles
  if (!Array.isArray(settings.ttsProfiles) || settings.ttsProfiles.length === 0) {
    const migrated = createTtsProfile({
      id: 'tts_default',
      name: '預設 TTS 方案',
      baseUrl: settings.tts?.baseUrl ?? '',
      apiKey: settings.tts?.apiKey ?? '',
      model: settings.tts?.model || 'tts-1',
      voice: settings.tts?.voice || 'zh-TW-HsiaoChenNeural',
      responseFormat: settings.tts?.responseFormat || 'mp3',
      speed: settings.tts?.speed ?? 1.0,
      pitch: settings.tts?.pitch ?? 0,
      volume: settings.tts?.volume ?? 100,
      sendExtendedParams: Boolean(settings.tts?.sendExtendedParams),
    });
    settings.ttsProfiles = [migrated];
    settings.activeTtsProfileId = migrated.id;
  } else {
    // If migrating from an older save where tts.baseUrl was set before profiles existed
    const active =
      settings.ttsProfiles.find((p) => p.id === settings.activeTtsProfileId) || settings.ttsProfiles[0];
    settings.activeTtsProfileId = active.id;
    if (!active.baseUrl && settings.tts?.baseUrl) {
      for (const k of TTS_PROFILE_FIELDS) active[k] = settings.tts[k];
    } else {
      for (const k of TTS_PROFILE_FIELDS) {
        if (active[k] !== undefined) settings.tts[k] = active[k];
      }
    }
  }

  // LLM profiles
  if (!Array.isArray(settings.llmProfiles) || settings.llmProfiles.length === 0) {
    const migrated = createLlmProfile({
      id: 'llm_default',
      name: '預設 LLM 方案',
      baseUrl: settings.llm?.baseUrl ?? '',
      apiKey: settings.llm?.apiKey ?? '',
      model: settings.llm?.model || 'gpt-4o-mini',
    });
    settings.llmProfiles = [migrated];
    settings.activeLlmProfileId = migrated.id;
  } else {
    const active =
      settings.llmProfiles.find((p) => p.id === settings.activeLlmProfileId) || settings.llmProfiles[0];
    settings.activeLlmProfileId = active.id;
    if (!active.baseUrl && settings.llm?.baseUrl) {
      for (const k of LLM_PROFILE_FIELDS) active[k] = settings.llm[k];
    } else {
      for (const k of LLM_PROFILE_FIELDS) {
        if (active[k] !== undefined) settings.llm[k] = active[k];
      }
    }
  }

  return settings;
}

let inMemoryFallback = null;

export function getSettings() {
  const defaults = createDefaultSettings();
  const ctx = getSTContext();

  if (ctx && ctx.extensionSettings && typeof ctx.extensionSettings === 'object') {
    if (!ctx.extensionSettings[MODULE_NAME]) {
      ctx.extensionSettings[MODULE_NAME] = structuredClone(defaults);
    } else {
      mergeDefaults(ctx.extensionSettings[MODULE_NAME], defaults);
    }
    return ensureProfiles(ctx.extensionSettings[MODULE_NAME]);
  }

  if (!inMemoryFallback) {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_FALLBACK_KEY) : null;
      inMemoryFallback = raw ? mergeDefaults(JSON.parse(raw), defaults) : structuredClone(defaults);
    } catch {
      inMemoryFallback = structuredClone(defaults);
    }
  }
  return ensureProfiles(inMemoryFallback);
}

export function saveSettings() {
  const ctx = getSTContext();
  if (ctx && typeof ctx.saveSettingsDebounced === 'function') {
    ctx.saveSettingsDebounced();
    return;
  }
  try {
    if (typeof localStorage !== 'undefined' && inMemoryFallback) {
      localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(inMemoryFallback));
    }
  } catch {
    // Ignore storage quota errors
  }
}

/* ============================================================================
 * TTS Multi-Profile Operations
 * ============================================================================ */

export function syncActiveTtsProfile(settings = getSettings()) {
  const profile = settings.ttsProfiles.find((p) => p.id === settings.activeTtsProfileId);
  if (!profile) return;
  for (const k of TTS_PROFILE_FIELDS) {
    profile[k] = settings.tts[k];
  }
  saveSettings();
}

export function selectTtsProfile(profileId, settings = getSettings()) {
  const profile = settings.ttsProfiles.find((p) => p.id === profileId);
  if (!profile) return false;
  settings.activeTtsProfileId = profile.id;
  for (const k of TTS_PROFILE_FIELDS) {
    settings.tts[k] = profile[k];
  }
  saveSettings();
  return true;
}

export function addTtsProfile(name, { cloneCurrent = false } = {}, settings = getSettings()) {
  const cleanName = String(name || '').trim() || `TTS 方案 ${settings.ttsProfiles.length + 1}`;
  const base = cloneCurrent ? settings.tts : {};
  const created = createTtsProfile({
    name: cleanName,
    baseUrl: base.baseUrl ?? '',
    apiKey: base.apiKey ?? '',
    model: base.model || 'tts-1',
    voice: base.voice || 'zh-TW-HsiaoChenNeural',
    responseFormat: base.responseFormat || 'mp3',
    speed: base.speed ?? 1.0,
    pitch: base.pitch ?? 0,
    volume: base.volume ?? 100,
    sendExtendedParams: Boolean(base.sendExtendedParams),
  });
  settings.ttsProfiles.push(created);
  selectTtsProfile(created.id, settings);
  return created;
}

export function renameTtsProfile(profileId, newName, settings = getSettings()) {
  const clean = String(newName || '').trim();
  if (!clean) return false;
  const profile = settings.ttsProfiles.find((p) => p.id === profileId);
  if (!profile) return false;
  profile.name = clean;
  saveSettings();
  return true;
}

export function deleteTtsProfile(profileId, settings = getSettings()) {
  if (settings.ttsProfiles.length <= 1) return false;
  const idx = settings.ttsProfiles.findIndex((p) => p.id === profileId);
  if (idx < 0) return false;
  settings.ttsProfiles.splice(idx, 1);
  const next = settings.ttsProfiles[Math.max(0, idx - 1)] || settings.ttsProfiles[0];
  selectTtsProfile(next.id, settings);
  return true;
}

/* ============================================================================
 * LLM Multi-Profile Operations (Completely independent from TTS)
 * ============================================================================ */

export function syncActiveLlmProfile(settings = getSettings()) {
  const profile = settings.llmProfiles.find((p) => p.id === settings.activeLlmProfileId);
  if (!profile) return;
  for (const k of LLM_PROFILE_FIELDS) {
    profile[k] = settings.llm[k];
  }
  saveSettings();
}

export function selectLlmProfile(profileId, settings = getSettings()) {
  const profile = settings.llmProfiles.find((p) => p.id === profileId);
  if (!profile) return false;
  settings.activeLlmProfileId = profile.id;
  for (const k of LLM_PROFILE_FIELDS) {
    settings.llm[k] = profile[k];
  }
  saveSettings();
  return true;
}

export function addLlmProfile(name, { cloneCurrent = false } = {}, settings = getSettings()) {
  const cleanName = String(name || '').trim() || `LLM 方案 ${settings.llmProfiles.length + 1}`;
  const base = cloneCurrent ? settings.llm : {};
  const created = createLlmProfile({
    name: cleanName,
    baseUrl: base.baseUrl ?? '',
    apiKey: base.apiKey ?? '',
    model: base.model || 'gpt-4o-mini',
  });
  settings.llmProfiles.push(created);
  selectLlmProfile(created.id, settings);
  return created;
}

export function renameLlmProfile(profileId, newName, settings = getSettings()) {
  const clean = String(newName || '').trim();
  if (!clean) return false;
  const profile = settings.llmProfiles.find((p) => p.id === profileId);
  if (!profile) return false;
  profile.name = clean;
  saveSettings();
  return true;
}

export function deleteLlmProfile(profileId, settings = getSettings()) {
  if (settings.llmProfiles.length <= 1) return false;
  const idx = settings.llmProfiles.findIndex((p) => p.id === profileId);
  if (idx < 0) return false;
  settings.llmProfiles.splice(idx, 1);
  const next = settings.llmProfiles[Math.max(0, idx - 1)] || settings.llmProfiles[0];
  selectLlmProfile(next.id, settings);
  return true;
}

/**
 * Resolve effective LLM auth purely from the active independent LLM profile.
 */
export function getEffectiveLlmAuth(settings = getSettings()) {
  return {
    baseUrl: settings?.llm?.baseUrl || '',
    apiKey: settings?.llm?.apiKey || '',
    model: settings?.llm?.model || 'gpt-4o-mini',
  };
}

/* ============================================================================
 * Two-Mode Reset (Preserve all saved Profiles/URLs/Tokens vs Full Factory Wipe)
 * ============================================================================ */

/**
 * Reset option 1: Restore playback mode, speed, regex rules, and UI defaults
 * while KEEPING all saved TTS & LLM profiles (URLs and Tokens remain untouched).
 */
export function resetKeepCredentials(targetSettings = getSettings()) {
  ensureProfiles(targetSettings);
  const preservedTtsProfiles = structuredClone(targetSettings.ttsProfiles).map((p) => ({
    ...createTtsProfile({ id: p.id, name: p.name }),
    baseUrl: p.baseUrl ?? '',
    apiKey: p.apiKey ?? '',
  }));
  const preservedLlmProfiles = structuredClone(targetSettings.llmProfiles).map((p) => ({
    ...createLlmProfile({ id: p.id, name: p.name }),
    baseUrl: p.baseUrl ?? '',
    apiKey: p.apiKey ?? '',
  }));
  const activeTtsId = targetSettings.activeTtsProfileId;
  const activeLlmId = targetSettings.activeLlmProfileId;

  const fresh = createDefaultSettings();
  fresh.ttsProfiles = preservedTtsProfiles;
  fresh.activeTtsProfileId =
    preservedTtsProfiles.some((p) => p.id === activeTtsId) ? activeTtsId : preservedTtsProfiles[0].id;

  fresh.llmProfiles = preservedLlmProfiles;
  fresh.activeLlmProfileId =
    preservedLlmProfiles.some((p) => p.id === activeLlmId) ? activeLlmId : preservedLlmProfiles[0].id;

  const activeTts = fresh.ttsProfiles.find((p) => p.id === fresh.activeTtsProfileId);
  if (activeTts) {
    for (const k of TTS_PROFILE_FIELDS) fresh.tts[k] = activeTts[k];
  }
  const activeLlm = fresh.llmProfiles.find((p) => p.id === fresh.activeLlmProfileId);
  if (activeLlm) {
    for (const k of LLM_PROFILE_FIELDS) fresh.llm[k] = activeLlm[k];
  }

  replaceObjectInPlace(targetSettings, fresh);
  saveSettings();
  return targetSettings;
}

/**
 * Reset option 2: Full factory reset, clearing ALL profiles, URLs, API Keys, and rules.
 */
export function resetAll(targetSettings = getSettings()) {
  const fresh = createDefaultSettings();
  replaceObjectInPlace(targetSettings, fresh);
  saveSettings();
  return targetSettings;
}

function replaceObjectInPlace(target, source) {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, val] of Object.entries(source)) {
    target[key] = structuredClone(val);
  }
}
