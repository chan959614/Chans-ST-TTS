/**
 * ST Direct TTS — OpenAI-compatible TTS Client & Blob URL Memory Cache.
 * Fully compatible with standard OpenAI /v1/audio/speech and edge-tts-worker (worker.js).
 */

/**
 * Normalize a user-supplied Base URL into canonical root/v1 endpoints.
 * Accepts:
 *   - https://example.com
 *   - https://example.com/
 *   - https://example.com/v1
 *   - https://example.com/v1/
 *   - https://example.com/v1/audio/speech
 *   - https://example.com/audio/speech
 */
export function resolveTtsEndpoints(rawBaseUrl) {
  const trimmed = (rawBaseUrl || '').trim();
  if (!trimmed) {
    return { valid: false, speechUrl: '', voicesUrl: '', modelsUrl: '', baseRoot: '' };
  }

  let normalized = trimmed.replace(/\/+$/, '');

  // Strip full speech endpoint suffixes if user pasted the entire URL
  normalized = normalized.replace(/\/v1\/audio\/speech$/i, '/v1');
  normalized = normalized.replace(/\/audio\/speech$/i, '');

  const hasV1 = /\/v1$/i.test(normalized);
  const v1Base = hasV1 ? normalized : `${normalized}/v1`;
  const baseRoot = hasV1 ? normalized.slice(0, -3) : normalized;

  return {
    valid: /^https?:\/\/.+/i.test(v1Base) || v1Base.startsWith('/'),
    baseRoot,
    v1Base,
    speechUrl: `${v1Base}/audio/speech`,
    voicesUrl: `${v1Base}/voices`,
    modelsUrl: `${v1Base}/models`,
  };
}

/**
 * Normalize an OpenAI-compatible Chat Completions Base URL.
 */
export function resolveChatEndpoint(rawBaseUrl) {
  const trimmed = (rawBaseUrl || '').trim();
  if (!trimmed) return { valid: false, chatUrl: '' };

  let normalized = trimmed.replace(/\/+$/, '');
  normalized = normalized.replace(/\/v1\/chat\/completions$/i, '/v1');
  normalized = normalized.replace(/\/chat\/completions$/i, '');

  const hasV1 = /\/v1$/i.test(normalized);
  const v1Base = hasV1 ? normalized : `${normalized}/v1`;
  const chatUrl = `${v1Base}/chat/completions`;

  return {
    valid: /^https?:\/\/.+/i.test(chatUrl) || chatUrl.startsWith('/'),
    chatUrl,
  };
}

/**
 * Fast deterministic FNV-1a 64-bit-like hex hash for cache keys (no async crypto needed).
 */
export function hashString(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0'));
}

/**
 * Build cache key incorporating message identity, cleaned text hash, and all active TTS parameters.
 * Any change in voice, model, speed, pitch, volume, format, or mode naturally produces a new key.
 */
export function buildCacheKey({ messageKey, text, ttsConfig, chunkIndex = -1 }) {
  const extPart = ttsConfig.sendExtendedParams
    ? `p=${Number(ttsConfig.pitch) || 0}|v=${Number(ttsConfig.volume) ?? 100}`
    : 'ext=off';

  const sig = [
    messageKey || 'anon',
    ttsConfig.playbackMode || 'sentence',
    chunkIndex,
    ttsConfig.model || 'tts-1',
    ttsConfig.voice || '',
    Number(ttsConfig.speed || 1).toFixed(2),
    ttsConfig.responseFormat || 'mp3',
    extPart,
    hashString(text || ''),
  ].join('|');

  return sig;
}

/**
 * In-memory Blob URL audio cache with per-message targeted eviction & URL.revokeObjectURL cleanup.
 */
export class AudioCache {
  constructor(maxEntries = 120) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, { url: string, messageKey: string, size: number, createdAt: number }>} */
    this.entries = new Map();
  }

  get(key) {
    const item = this.entries.get(key);
    if (!item) return null;
    // Refresh LRU order
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.url;
  }

  set(key, blob, messageKey) {
    const existing = this.entries.get(key);
    if (existing) {
      safeRevoke(existing.url);
      this.entries.delete(key);
    }

    const url = URL.createObjectURL(blob);
    this.entries.set(key, {
      url,
      messageKey: messageKey || 'anon',
      size: blob.size || 0,
      createdAt: Date.now(),
    });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      if (oldest) safeRevoke(oldest.url);
      this.entries.delete(oldestKey);
    }

    return url;
  }

  /**
   * Precisely evict & revoke all audio Blob URLs belonging to a specific message floor.
   */
  evictMessage(messageKey) {
    let removed = 0;
    for (const [key, item] of [...this.entries.entries()]) {
      if (item.messageKey === messageKey) {
        safeRevoke(item.url);
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear entire cache and release all Blob URLs.
   */
  clearAll() {
    for (const item of this.entries.values()) {
      safeRevoke(item.url);
    }
    this.entries.clear();
  }

  stats() {
    let totalBytes = 0;
    for (const item of this.entries.values()) totalBytes += item.size;
    return { count: this.entries.size, totalBytes };
  }
}

function safeRevoke(url) {
  try {
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  } catch {
    // Ignore revoke errors
  }
}

/**
 * Call OpenAI-compatible POST /v1/audio/speech and return a Blob.
 */
export async function synthesizeSpeech({ text, ttsConfig, signal }) {
  const endpoints = resolveTtsEndpoints(ttsConfig.baseUrl);
  if (!endpoints.valid) {
    throw new Error('請先填寫有效的 TTS Base URL（例如 https://your-worker.workers.dev）');
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  const apiKey = (ttsConfig.apiKey || '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const speed = clampNumber(ttsConfig.speed, 0.25, 4.0, 1.0);
  const payload = {
    model: (ttsConfig.model || 'tts-1').trim(),
    input: text,
    voice: (ttsConfig.voice || 'zh-TW-HsiaoChenNeural').trim(),
    response_format: (ttsConfig.responseFormat || 'mp3').trim(),
    speed,
  };

  // Optional Edge TTS Worker extended params: only include when explicitly enabled & non-default
  if (ttsConfig.sendExtendedParams) {
    const pitch = clampNumber(ttsConfig.pitch, -100, 100, 0);
    const volume = clampNumber(ttsConfig.volume, -100, 100, 100);
    if (pitch !== 0) payload.pitch = pitch;
    if (volume !== 100) payload.volume = volume;
  }

  const timeoutMs = Math.max(5000, Number(ttsConfig.timeoutMs) || 30000);
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(new Error('TTS 請求逾時')), timeoutMs);

  const combinedSignal = combineAbortSignals(signal, timeoutCtrl.signal);

  try {
    const resp = await fetch(endpoints.speechUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed?.error?.message || parsed?.error || errText;
      } catch {
        // Keep raw text
      }
      throw new Error(`TTS 合成失敗 (HTTP ${resp.status})：${msg || resp.statusText}`);
    }

    const blob = await resp.blob();
    if (!blob || blob.size === 0) {
      throw new Error('TTS 伺服器回傳了空的音訊資料');
    }

    return {
      blob,
      contentType: resp.headers.get('content-type') || 'audio/mpeg',
      chunksHeader: resp.headers.get('x-edge-tts-chunks'),
    };
  } catch (err) {
    if (signal?.aborted) {
      const abortErr = new Error('已取消朗讀');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    if (timeoutCtrl.signal.aborted) {
      throw new Error(`TTS 請求逾時（超過 ${Math.round(timeoutMs / 1000)} 秒），建議切換為「按句分段預載」模式`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch available voice list from worker.js /v1/voices endpoint (optional locale filter).
 */
export async function fetchVoicesFromServer(ttsConfig, locale = '') {
  const endpoints = resolveTtsEndpoints(ttsConfig.baseUrl);
  if (!endpoints.valid) {
    throw new Error('請先填寫有效的 TTS Base URL');
  }

  const url = locale ? `${endpoints.voicesUrl}?locale=${encodeURIComponent(locale)}` : endpoints.voicesUrl;
  const headers = {};
  const apiKey = (ttsConfig.apiKey || '').trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`無法取得音色清單 (HTTP ${resp.status})，此端點可能不支援 /v1/voices`);
  }
  const data = await resp.json();
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return list.map((v) => ({
    id: v.id || v.ShortName || v.name,
    label: formatVoiceLabel(v),
    locale: v.locale || v.Locale || '',
    gender: v.gender || v.Gender || '',
  }));
}

function formatVoiceLabel(v) {
  const id = v.id || v.ShortName || v.name || '';
  const gender = v.gender === 'Female' ? '女' : v.gender === 'Male' ? '男' : '';
  const personalities = Array.isArray(v.personalities) && v.personalities.length ? v.personalities.slice(0, 2).join('、') : '';
  const meta = [gender, personalities].filter(Boolean).join(' · ');
  return meta ? `${id} (${meta})` : id;
}

function clampNumber(val, min, max, fallback) {
  const n = Number(val);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function combineAbortSignals(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a, b]);
  }
  const ctrl = new AbortController();
  const onAbort = (src) => ctrl.abort(src.reason);
  if (a.aborted) { ctrl.abort(a.reason); return ctrl.signal; }
  if (b.aborted) { ctrl.abort(b.reason); return ctrl.signal; }
  a.addEventListener('abort', () => onAbort(a), { once: true });
  b.addEventListener('abort', () => onAbort(b), { once: true });
  return ctrl.signal;
}
