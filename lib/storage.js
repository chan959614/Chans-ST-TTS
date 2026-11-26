/**
 * ST Direct TTS — Settings persistence via SillyTavern.getContext().extensionSettings
 * Compatible with both upstream SillyTavern and TauriTavern (Android / Desktop).
 * Uses zero fragile relative imports.
 */

import { MODULE_NAME, createDefaultSettings } from './constants.js';

const LOCAL_FALLBACK_KEY = `${MODULE_NAME}_local_fallback_v1`;

/**
 * Resolve SillyTavern runtime context safely.
 */
export function getSTContext() {
  if (typeof globalThis !== 'undefined' && globalThis.SillyTavern?.getContext) {
    return globalThis.SillyTavern.getContext();
  }
  return null;
}

/**
 * Detect whether we are running inside TauriTavern.
 */
export function isTauriTavern() {
  return Boolean(typeof globalThis !== 'undefined' && globalThis.__TAURITAVERN__);
}

/**
 * Recursively merge defaults into target without clobbering existing user values.
 */
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

let inMemoryFallback = null;

/**
 * Get mutable settings object bound to extensionSettings[MODULE_NAME].
 */
export function getSettings() {
  const defaults = createDefaultSettings();
  const ctx = getSTContext();

  if (ctx && ctx.extensionSettings && typeof ctx.extensionSettings === 'object') {
    if (!ctx.extensionSettings[MODULE_NAME]) {
      ctx.extensionSettings[MODULE_NAME] = structuredClone(defaults);
    } else {
      mergeDefaults(ctx.extensionSettings[MODULE_NAME], defaults);
    }
    return ctx.extensionSettings[MODULE_NAME];
  }

  // Fallback for standalone testing outside SillyTavern
  if (!inMemoryFallback) {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_FALLBACK_KEY) : null;
      inMemoryFallback = raw ? mergeDefaults(JSON.parse(raw), defaults) : structuredClone(defaults);
    } catch {
      inMemoryFallback = structuredClone(defaults);
    }
  }
  return inMemoryFallback;
}

/**
 * Persist settings using SillyTavern's saveSettingsDebounced().
 */
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
    // Ignore storage quota errors in restricted sandboxes
  }
}

/**
 * Reset option 1: Restore defaults while KEEPING TTS/LLM Base URLs & API Keys (Tokens).
 * Prevents users from having to re-enter endpoints and secrets after experimenting.
 */
export function resetKeepCredentials(targetSettings = getSettings()) {
  const preserved = {
    ttsBaseUrl: targetSettings?.tts?.baseUrl ?? '',
    ttsApiKey: targetSettings?.tts?.apiKey ?? '',
    llmBaseUrl: targetSettings?.llm?.baseUrl ?? '',
    llmApiKey: targetSettings?.llm?.apiKey ?? '',
    llmReuseTtsAuth: Boolean(targetSettings?.llm?.reuseTtsAuth),
  };

  const fresh = createDefaultSettings();
  fresh.tts.baseUrl = preserved.ttsBaseUrl;
  fresh.tts.apiKey = preserved.ttsApiKey;
  fresh.llm.baseUrl = preserved.llmBaseUrl;
  fresh.llm.apiKey = preserved.llmApiKey;
  fresh.llm.reuseTtsAuth = preserved.llmReuseTtsAuth;

  replaceObjectInPlace(targetSettings, fresh);
  saveSettings();
  return targetSettings;
}

/**
 * Reset option 2: Full factory reset, clearing ALL settings including URLs and API Keys.
 */
export function resetAll(targetSettings = getSettings()) {
  const fresh = createDefaultSettings();
  replaceObjectInPlace(targetSettings, fresh);
  saveSettings();
  return targetSettings;
}

/**
 * Resolve effective LLM credentials (supports reusing TTS URL & Token to avoid duplicate entry).
 */
export function getEffectiveLlmAuth(settings = getSettings()) {
  const reuse = Boolean(settings?.llm?.reuseTtsAuth);
  return {
    baseUrl: (reuse ? settings?.tts?.baseUrl : settings?.llm?.baseUrl) || '',
    apiKey: (reuse ? settings?.tts?.apiKey : settings?.llm?.apiKey) || '',
    model: settings?.llm?.model || 'gpt-4o-mini',
    reuseTtsAuth: reuse,
  };
}

function replaceObjectInPlace(target, source) {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, val] of Object.entries(source)) {
    target[key] = structuredClone(val);
  }
}
