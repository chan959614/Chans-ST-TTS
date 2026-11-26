/**
 * ST Direct TTS — Native DOM UI Controller
 * Renders:
 * 1. Floating 2-item context menu (viewport-clamped, 150ms anti-penetration shield)
 * 2. Compact floating mini player bar (progress, pause/resume, stop, NotAllowedError resume)
 * 3. SillyTavern #extensions_settings2 inline-drawer panel
 *
 * All user-supplied strings are inserted via textContent / value properties (zero XSS).
 */

import { DEFAULT_MODELS, FALLBACK_VOICES, REGEX_PRESETS, RESPONSE_FORMATS } from './constants.js';
import { analyzeRegexSafety, parseRulePattern, runRegexPipeline, splitIntoSentences } from './regexEngine.js';
import { getEffectiveLlmAuth, resetAll, resetKeepCredentials, saveSettings } from './storage.js';
import { fetchVoicesFromServer, resolveChatEndpoint, resolveTtsEndpoints } from './ttsClient.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
    } else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/* ============================================================================
 * 1. Floating 2-Item Context Menu
 * ============================================================================ */
export class FloatingContextMenu {
  constructor({ onRead, onReread }) {
    this.onRead = onRead;
    this.onReread = onReread;
    this.backdropEl = null;
    this.menuEl = null;
    this.openedAt = 0;
    this._onKeyDown = (ev) => {
      if (ev.key === 'Escape') this.close();
    };
  }

  open({ x, y, mesElement }) {
    this.close();
    this.openedAt = Date.now();

    const backdrop = el('div', {
      className: 'st-dtts-backdrop',
      'data-testid': 'st-dtts-menu-backdrop',
    });

    const dismissIfSafe = (ev) => {
      // 150ms anti-penetration shield after opening on touch devices
      if (Date.now() - this.openedAt < 150) {
        ev.preventDefault?.();
        return;
      }
      this.close();
    };
    backdrop.addEventListener('pointerdown', dismissIfSafe);
    backdrop.addEventListener('click', dismissIfSafe);

    const btnRead = el('button', {
      type: 'button',
      className: 'st-dtts-menu-btn',
      role: 'menuitem',
      text: '朗讀',
      onClick: (ev) => {
        ev.stopPropagation();
        this.close();
        // Synchronous call so audioPlayer.unlockAudioSync() runs inside user gesture!
        this.onRead?.(mesElement);
      },
    });

    const btnReread = el('button', {
      type: 'button',
      className: 'st-dtts-menu-btn',
      role: 'menuitem',
      text: '重製朗讀',
      onClick: (ev) => {
        ev.stopPropagation();
        this.close();
        this.onReread?.(mesElement);
      },
    });

    const menu = el(
      'div',
      {
        className: 'st-dtts-menu',
        role: 'menu',
        'aria-label': '語音朗讀選單',
      },
      [btnRead, btnReread],
    );

    document.body.appendChild(backdrop);
    document.body.appendChild(menu);

    // Clamp menu position inside current viewport
    const rect = menu.getBoundingClientRect();
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 6;
    let top = y + 6;
    if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad);
    if (top + rect.height + pad > vh) top = Math.max(pad, y - rect.height - 6);
    if (left < pad) left = pad;
    if (top < pad) top = pad;

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;

    this.backdropEl = backdrop;
    this.menuEl = menu;
    document.addEventListener('keydown', this._onKeyDown, true);
  }

  close() {
    if (this.backdropEl) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    document.removeEventListener('keydown', this._onKeyDown, true);
  }
}

/* ============================================================================
 * 2. Compact Floating Mini Player Bar
 * ============================================================================ */
export class MiniPlayerBar {
  constructor({ onTogglePause, onResumeBlocked, onStop }) {
    this.onTogglePause = onTogglePause;
    this.onResumeBlocked = onResumeBlocked;
    this.onStop = onStop;

    this.titleEl = el('div', { className: 'st-dtts-player-title' });
    this.subEl = el('div', { className: 'st-dtts-player-sub' });
    this.btnResumeBlocked = el('button', {
      type: 'button',
      className: 'st-dtts-player-btn is-primary',
      text: '點擊繼續播放',
      onClick: () => this.onResumeBlocked?.(),
    });
    this.btnPause = el('button', {
      type: 'button',
      className: 'st-dtts-player-btn',
      text: '暫停',
      onClick: () => this.onTogglePause?.(),
    });
    this.btnStop = el('button', {
      type: 'button',
      className: 'st-dtts-player-btn',
      text: '停止',
      onClick: () => this.onStop?.(),
    });

    this.root = el(
      'div',
      {
        className: 'st-dtts-player',
        role: 'region',
        'aria-label': '語音朗讀播放控制條',
        hidden: true,
      },
      [
        el('div', { className: 'st-dtts-player-info' }, [this.titleEl, this.subEl]),
        el('div', { className: 'st-dtts-player-actions' }, [this.btnResumeBlocked, this.btnPause, this.btnStop]),
      ],
    );

    document.body.appendChild(this.root);
  }

  render(state, visible = true) {
    if (!visible || state.status === 'idle') {
      this.root.hidden = true;
      return;
    }

    this.root.hidden = false;
    const progressText =
      state.mode === 'sentence' && state.totalChunks > 1
        ? `第 ${state.currentIndex} / ${state.totalChunks} 句`
        : '整則朗讀';

    const statusMap = {
      loading: '合成載入中',
      playing: state.cacheHit ? '播放中 · 快取命中' : '播放中',
      paused: '已暫停',
      blocked: '等待手動繼續播放',
      error: '朗讀失敗',
    };

    const statusLabel = statusMap[state.status] || state.status;
    this.titleEl.textContent = `${state.speakerName || '語音朗讀'} · ${statusLabel} (${progressText})`;

    if (state.status === 'error' || state.status === 'blocked') {
      this.subEl.textContent = state.errorMessage || '';
      this.subEl.classList.add('is-error');
    } else {
      this.subEl.textContent = state.currentText || '';
      this.subEl.classList.remove('is-error');
    }

    const isBlocked = state.status === 'blocked';
    const isError = state.status === 'error';
    this.btnResumeBlocked.hidden = !isBlocked;
    this.btnPause.hidden = isBlocked || isError;
    this.btnPause.textContent = state.status === 'paused' ? '繼續' : '暫停';
  }

  destroy() {
    this.root.remove();
  }
}

/* ============================================================================
 * 3. Extension Settings Panel (#extensions_settings2)
 * ============================================================================ */
export class SettingsPanelUI {
  constructor({
    settings,
    cache,
    onSettingsChanged,
    onTestTts,
    onFetchLatestRaw,
    onRunAgent,
    onClearCache,
    onAfterReset,
  }) {
    this.settings = settings;
    this.cache = cache;
    this.onSettingsChanged = onSettingsChanged;
    this.onTestTts = onTestTts;
    this.onFetchLatestRaw = onFetchLatestRaw;
    this.onRunAgent = onRunAgent;
    this.onClearCache = onClearCache;
    this.onAfterReset = onAfterReset;

    this.activeTab = 'tts'; // 'tts' | 'regex' | 'agent'
    this.compareTab = 'manual'; // 'manual' | 'snapshot'
    this.manualSampleText = '';
    this.manualSourceLabel = '手動貼上文本';
    this.lastSnapshot = null;
    this.voices = [...FALLBACK_VOICES];
    this.voiceStatus = '';
    this.ttsTestStatus = { kind: '', text: '' };
    this.agentState = {
      busy: false,
      statusText: '',
      errorText: '',
      sampleSourceLabel: '',
      sampleRawText: '',
      userPrompt: '',
      result: null,
    };
    this.pendingFullResetConfirm = false;
    this.resetFeedback = '';
    this.showApiKey = false;
    this.showLlmKey = false;
    this.containerEl = null;
  }

  mount(targetHost) {
    const host = targetHost || document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;

    const existing = host.querySelector('.st-dtts-settings-root');
    if (existing) existing.remove();

    const drawerContent = el('div', { className: 'inline-drawer-content st-dtts-settings' });
    const icon = el('span', { className: 'inline-drawer-icon', text: '▾', 'aria-hidden': 'true' });
    const header = el(
      'div',
      {
        className: 'inline-drawer-toggle inline-drawer-header',
        role: 'button',
        tabindex: '0',
        'aria-expanded': 'true',
      },
      [el('b', { text: 'ST Direct TTS 語音朗讀' }), icon],
    );

    const toggleDrawer = () => {
      const collapsed = drawerContent.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
      icon.textContent = collapsed ? '▸' : '▾';
    };
    header.addEventListener('click', toggleDrawer);
    header.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggleDrawer();
      }
    });

    const wrapper = el('div', { className: 'st-dtts-settings-root' }, [
      el('div', { className: 'inline-drawer' }, [header, drawerContent]),
    ]);

    host.appendChild(wrapper);
    this.containerEl = drawerContent;
    this.render();
    return true;
  }

  setLastSnapshot(snapshot) {
    this.lastSnapshot = snapshot;
    if (this.activeTab === 'regex' && this.compareTab === 'snapshot') {
      this.render();
    } else {
      // Update badge/counter quietly if regex tab is visible
      if (this.activeTab === 'regex') this.render();
    }
  }

  refreshCacheStats() {
    if (this.activeTab === 'tts') this.render();
  }

  render() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = '';

    // Top-level enable toggle
    const enableToggle = el('label', { className: 'st-dtts-checkbox' }, [
      (() => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = this.settings.enabled !== false;
        cb.addEventListener('change', () => {
          this.settings.enabled = cb.checked;
          saveSettings();
          this.onSettingsChanged?.();
        });
        return cb;
      })(),
      el('span', { text: '啟用雙擊訊息彈出朗讀選單' }),
    ]);

    // Tab bar
    const tabs = [
      { id: 'tts', label: 'TTS 與播放' },
      { id: 'regex', label: '正則與對比' },
      { id: 'agent', label: 'AI 正則助手' },
    ];
    const tabBar = el(
      'div',
      { className: 'st-dtts-tabs', role: 'tablist', 'aria-label': 'ST Direct TTS 設定分頁' },
      tabs.map((t) =>
        el('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': String(this.activeTab === t.id),
          className: `st-dtts-tab ${this.activeTab === t.id ? 'is-active' : ''}`,
          text: t.label,
          onClick: () => {
            this.activeTab = t.id;
            this.render();
          },
        }),
      ),
    );

    this.containerEl.appendChild(enableToggle);
    this.containerEl.appendChild(tabBar);

    if (this.activeTab === 'tts') {
      this.containerEl.appendChild(this._renderTtsTab());
    } else if (this.activeTab === 'regex') {
      this.containerEl.appendChild(this._renderRegexTab());
    } else {
      this.containerEl.appendChild(this._renderAgentTab());
    }
  }

  /* ---------------- Tab 1: TTS & Playback & Reset ---------------- */
  _renderTtsTab() {
    const s = this.settings.tts;
    const section = el('div', { className: 'st-dtts-section' });

    // Base URL with live endpoint preview
    const endpointHint = el('div', { className: 'st-dtts-hint is-mono' });
    const updateEndpointHint = () => {
      const ep = resolveTtsEndpoints(s.baseUrl);
      endpointHint.textContent = ep.valid
        ? `實際端點：${ep.speechUrl}`
        : '支援填寫根網址、/v1 或完整 /v1/audio/speech（自動補齊）';
    };
    updateEndpointHint();

    const baseUrlInput = el('input', {
      type: 'url',
      className: 'st-dtts-input is-mono',
      placeholder: 'https://your-edge-tts.workers.dev 或 /v1',
      'aria-label': 'TTS Base URL',
    });
    baseUrlInput.value = s.baseUrl || '';
    baseUrlInput.addEventListener('input', () => {
      s.baseUrl = baseUrlInput.value.trim();
      updateEndpointHint();
      saveSettings();
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: 'TTS Base URL（OpenAI 相容 / Edge Worker）' }),
        baseUrlInput,
        endpointHint,
      ]),
    );

    // API Key (optional) with reveal button
    const apiKeyInput = el('input', {
      type: this.showApiKey ? 'text' : 'password',
      className: 'st-dtts-input is-mono',
      placeholder: '選填；有值時自動帶入 Authorization: Bearer',
      autocomplete: 'off',
      'aria-label': 'TTS API Key',
    });
    apiKeyInput.value = s.apiKey || '';
    apiKeyInput.addEventListener('input', () => {
      s.apiKey = apiKeyInput.value;
      saveSettings();
    });

    const toggleKeyBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-sm',
      text: this.showApiKey ? '隱藏' : '顯示',
      onClick: () => {
        this.showApiKey = !this.showApiKey;
        this.render();
      },
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: 'API Key / Token（選填）' }),
        el('div', { className: 'st-dtts-inline' }, [apiKeyInput, toggleKeyBtn]),
      ]),
    );

    // Model + Response Format row
    const modelInput = el('input', {
      type: 'text',
      className: 'st-dtts-input is-mono',
      list: 'st-dtts-model-list',
      placeholder: 'tts-1',
      'aria-label': 'TTS Model',
    });
    modelInput.value = s.model || 'tts-1';
    modelInput.addEventListener('input', () => {
      s.model = modelInput.value.trim();
      saveSettings();
    });
    const modelDatalist = el(
      'datalist',
      { id: 'st-dtts-model-list' },
      DEFAULT_MODELS.map((m) => el('option', { value: m })),
    );

    const formatSelect = el(
      'select',
      { className: 'st-dtts-select', 'aria-label': '音訊格式' },
      RESPONSE_FORMATS.map((f) => el('option', { value: f.value, text: f.label })),
    );
    formatSelect.value = s.responseFormat || 'mp3';
    formatSelect.addEventListener('change', () => {
      s.responseFormat = formatSelect.value;
      saveSettings();
      this.render();
    });

    section.appendChild(
      el('div', { className: 'st-dtts-row' }, [
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: 'Model（tts-1-hd 為 96kbps）' }),
          modelInput,
          modelDatalist,
        ]),
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: '音訊格式 Response Format' }),
          formatSelect,
        ]),
      ]),
    );

    if (s.responseFormat === 'opus' && s.playbackMode === 'whole') {
      section.appendChild(
        el('div', {
          className: 'st-dtts-notice is-warn',
          text: '提示：Edge TTS Worker 的 opus/webm 僅支援單段 ≤4KB 文字；長文請使用 mp3 或切換為「按句分段預載」模式。',
        }),
      );
    }

    // Voice selector + custom input + /v1/voices loader (worker.js compatible)
    const localeSelect = el(
      'select',
      { className: 'st-dtts-select', 'aria-label': '音色語言篩選' },
      [
        { v: 'zh', t: '中文（全部）' },
        { v: 'zh-TW', t: '繁體中文（臺灣）' },
        { v: 'zh-CN', t: '簡體中文（中國）' },
        { v: 'zh-HK', t: '粵語（香港）' },
        { v: 'ja', t: '日本語' },
        { v: 'en', t: 'English' },
        { v: '', t: '全部語言' },
      ].map((o) => el('option', { value: o.v, text: o.t })),
    );
    localeSelect.value = this.settings.ui.voiceLocaleFilter ?? 'zh';
    localeSelect.addEventListener('change', () => {
      this.settings.ui.voiceLocaleFilter = localeSelect.value;
      saveSettings();
    });

    const loadVoicesBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-sm',
      text: '載入伺服器音色',
      onClick: async () => {
        loadVoicesBtn.disabled = true;
        this.voiceStatus = '正在請求 /v1/voices…';
        this.render();
        try {
          const list = await fetchVoicesFromServer(s, this.settings.ui.voiceLocaleFilter || '');
          if (list.length > 0) {
            this.voices = list;
            this.voiceStatus = `已載入 ${list.length} 個可用音色`;
          } else {
            this.voiceStatus = '伺服器回傳空音色清單，保留內建清單';
          }
        } catch (err) {
          this.voiceStatus = err.message;
        } finally {
          this.render();
        }
      },
    });

    const voiceSelect = el(
      'select',
      { className: 'st-dtts-select', 'aria-label': '音色下拉選單' },
      [
        ...this.voices.map((v) => el('option', { value: v.id, text: v.label || v.id })),
        ...(this.voices.some((v) => v.id === s.voice) ? [] : [el('option', { value: s.voice, text: `${s.voice} (自訂)` })]),
      ],
    );
    voiceSelect.value = s.voice || 'zh-TW-HsiaoChenNeural';
    voiceSelect.addEventListener('change', () => {
      s.voice = voiceSelect.value;
      voiceCustomInput.value = s.voice;
      saveSettings();
    });

    const voiceCustomInput = el('input', {
      type: 'text',
      className: 'st-dtts-input is-mono',
      placeholder: '可直接輸入任何音色 ID（如 zh-TW-HsiaoChenNeural、alloy）',
      'aria-label': '自訂音色名稱',
    });
    voiceCustomInput.value = s.voice || '';
    voiceCustomInput.addEventListener('input', () => {
      s.voice = voiceCustomInput.value.trim();
      saveSettings();
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: '音色 Voice（可下拉或自訂輸入）' }),
        el('div', { className: 'st-dtts-inline' }, [localeSelect, loadVoicesBtn]),
        voiceSelect,
        voiceCustomInput,
        this.voiceStatus ? el('div', { className: 'st-dtts-hint', text: this.voiceStatus }) : null,
      ]),
    );

    // Speed slider
    const speedVal = el('span', { className: 'is-mono', text: `${Number(s.speed || 1).toFixed(2)}x` });
    const speedInput = el('input', {
      type: 'range',
      min: '0.25',
      max: '4',
      step: '0.05',
      'aria-label': '語速倍率',
    });
    speedInput.value = String(s.speed ?? 1.0);
    speedInput.addEventListener('input', () => {
      s.speed = Number(speedInput.value);
      speedVal.textContent = `${s.speed.toFixed(2)}x`;
      saveSettings();
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('div', { className: 'st-dtts-label' }, [el('span', { text: '語速 Speed (0.25x – 4.0x)' }), speedVal]),
        speedInput,
      ]),
    );

    // Optional Edge TTS Worker extended parameters (pitch & volume)
    const extCb = el('input', { type: 'checkbox' });
    extCb.checked = Boolean(s.sendExtendedParams);
    extCb.addEventListener('change', () => {
      s.sendExtendedParams = extCb.checked;
      saveSettings();
      this.render();
    });

    section.appendChild(
      el('label', { className: 'st-dtts-checkbox' }, [
        extCb,
        el('span', { text: '傳送 Edge Worker 擴展參數（音調 pitch / 音量 volume）' }),
      ]),
    );

    if (s.sendExtendedParams) {
      const pitchVal = el('span', { className: 'is-mono', text: `${s.pitch ?? 0}%` });
      const pitchInput = el('input', { type: 'range', min: '-100', max: '100', step: '5', 'aria-label': '音調 pitch' });
      pitchInput.value = String(s.pitch ?? 0);
      pitchInput.addEventListener('input', () => {
        s.pitch = Number(pitchInput.value);
        pitchVal.textContent = `${s.pitch}%`;
        saveSettings();
      });

      const volVal = el('span', { className: 'is-mono', text: `${s.volume ?? 100}%` });
      const volInput = el('input', { type: 'range', min: '-100', max: '100', step: '5', 'aria-label': '音量 volume' });
      volInput.value = String(s.volume ?? 100);
      volInput.addEventListener('input', () => {
        s.volume = Number(volInput.value);
        volVal.textContent = `${s.volume}%`;
        saveSettings();
      });

      section.appendChild(
        el('div', { className: 'st-dtts-row' }, [
          el('div', { className: 'st-dtts-field' }, [
            el('div', { className: 'st-dtts-label' }, [el('span', { text: '音調 Pitch' }), pitchVal]),
            pitchInput,
          ]),
          el('div', { className: 'st-dtts-field' }, [
            el('div', { className: 'st-dtts-label' }, [el('span', { text: '音量 Volume' }), volVal]),
            volInput,
          ]),
        ]),
      );
    }

    section.appendChild(el('div', { className: 'st-dtts-divider' }));

    // Playback & Cache mode
    const modeSelect = el(
      'select',
      { className: 'st-dtts-select', 'aria-label': '朗讀分段模式' },
      [
        el('option', { value: 'sentence', text: '按句分段預載佇列（推薦・低首字延遲）' }),
        el('option', { value: 'whole', text: '整則一次合成（單次請求完整音檔）' }),
      ],
    );
    modeSelect.value = s.playbackMode || 'sentence';
    modeSelect.addEventListener('change', () => {
      s.playbackMode = modeSelect.value;
      saveSettings();
      this.render();
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: '朗讀分段與快取模式' }),
        modeSelect,
      ]),
    );

    if (s.playbackMode === 'sentence') {
      const maxCharsInput = el('input', {
        type: 'number',
        min: '40',
        max: '1500',
        className: 'st-dtts-input is-mono',
        'aria-label': '單段最大字數',
      });
      maxCharsInput.value = String(s.maxSentenceChars || 220);
      maxCharsInput.addEventListener('change', () => {
        s.maxSentenceChars = Math.max(40, Math.min(1500, Number(maxCharsInput.value) || 220));
        maxCharsInput.value = String(s.maxSentenceChars);
        saveSettings();
      });

      const prefetchInput = el('select', { className: 'st-dtts-select', 'aria-label': '背景預載句數' }, [
        el('option', { value: '1', text: '預載後續 1 句' }),
        el('option', { value: '2', text: '預載後續 2 句（預設）' }),
        el('option', { value: '3', text: '預載後續 3 句' }),
      ]);
      prefetchInput.value = String(s.prefetchCount ?? 2);
      prefetchInput.addEventListener('change', () => {
        s.prefetchCount = Number(prefetchInput.value);
        saveSettings();
      });

      section.appendChild(
        el('div', { className: 'st-dtts-row' }, [
          el('div', { className: 'st-dtts-field' }, [
            el('label', { className: 'st-dtts-label', text: '單段字數上限' }),
            maxCharsInput,
          ]),
          el('div', { className: 'st-dtts-field' }, [
            el('label', { className: 'st-dtts-label', text: '背景預載佇列' }),
            prefetchInput,
          ]),
        ]),
      );
    }

    // Test connection & audio preview button
    const testBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-primary',
      text: '測試連線／試聽',
      onClick: async () => {
        testBtn.disabled = true;
        this.ttsTestStatus = { kind: '', text: '正在合成試聽音訊…' };
        this.render();
        try {
          const info = await this.onTestTts?.();
          this.ttsTestStatus = { kind: 'ok', text: info || '試聽成功！連線與播放正常。' };
        } catch (err) {
          this.ttsTestStatus = { kind: 'error', text: err?.message || '測試失敗' };
        } finally {
          this.render();
        }
      },
    });

    const stats = this.cache?.stats?.() || { count: 0, totalBytes: 0 };
    const clearCacheBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn',
      text: `清除音訊快取 (${stats.count} 筆 · ${(stats.totalBytes / 1024).toFixed(0)} KB)`,
      onClick: () => {
        this.onClearCache?.();
        this.render();
      },
    });

    section.appendChild(el('div', { className: 'st-dtts-actions' }, [testBtn, clearCacheBtn]));

    if (this.ttsTestStatus.text) {
      section.appendChild(
        el('div', {
          className: `st-dtts-notice ${this.ttsTestStatus.kind === 'ok' ? 'is-ok' : this.ttsTestStatus.kind === 'error' ? 'is-error' : ''}`,
          text: this.ttsTestStatus.text,
        }),
      );
    }

    section.appendChild(el('div', { className: 'st-dtts-divider' }));

    // Two explicit Reset Options (preserves URL/Token vs full wipe)
    const resetKeepBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn',
      text: '恢復預設（保留 URL 與 Token）',
      onClick: () => {
        resetKeepCredentials(this.settings);
        this.pendingFullResetConfirm = false;
        this.resetFeedback = '已恢復音色、語速、模式與正則為預設值，您的 URL 與 Token 已保留。';
        this.onAfterReset?.();
        this.render();
      },
    });

    const resetAllBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-danger',
      text: '完全重設（清除全部含 URL 與 Token）',
      onClick: () => {
        this.pendingFullResetConfirm = true;
        this.resetFeedback = '';
        this.render();
      },
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: '重設設定選項' }),
        el('div', { className: 'st-dtts-actions' }, [resetKeepBtn, resetAllBtn]),
      ]),
    );

    if (this.pendingFullResetConfirm) {
      section.appendChild(
        el('div', { className: 'st-dtts-confirm-bar' }, [
          el('div', { text: '確定要完全重設？這將同時清空 TTS 與 AI 助手的 Base URL 及 API Key。' }),
          el('div', { className: 'st-dtts-actions' }, [
            el('button', {
              type: 'button',
              className: 'st-dtts-btn is-sm is-danger',
              text: '確認完全重設',
              onClick: () => {
                resetAll(this.settings);
                this.pendingFullResetConfirm = false;
                this.resetFeedback = '已清除所有設定（含 URL 與 Token）並恢復出廠預設值。';
                this.onAfterReset?.();
                this.render();
              },
            }),
            el('button', {
              type: 'button',
              className: 'st-dtts-btn is-sm',
              text: '取消',
              onClick: () => {
                this.pendingFullResetConfirm = false;
                this.render();
              },
            }),
          ]),
        ]),
      );
    }

    if (this.resetFeedback) {
      section.appendChild(el('div', { className: 'st-dtts-notice is-ok', text: this.resetFeedback }));
    }

    return section;
  }

  /* ---------------- Tab 2: Regex Rules & Before/After Diff Panel ---------------- */
  _renderRegexTab() {
    const section = el('div', { className: 'st-dtts-section' });
    const rules = this.settings.regexRules;

    // Toolbar: Add empty rule + Insert preset rule
    const presetSelect = el(
      'select',
      { className: 'st-dtts-select', 'aria-label': '選擇常用正則範本' },
      [
        el('option', { value: '', text: '插入常用正則範本…' }),
        ...REGEX_PRESETS.map((p) => el('option', { value: p.id, text: p.name })),
      ],
    );
    presetSelect.addEventListener('change', () => {
      const preset = REGEX_PRESETS.find((p) => p.id === presetSelect.value);
      if (!preset) return;
      rules.push({
        id: `rule_${Date.now()}`,
        name: preset.name,
        findRegex: preset.findRegex,
        replaceString: preset.replaceString,
        enabled: true,
      });
      saveSettings();
      this.render();
    });

    const addRuleBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-primary is-sm',
      text: '+ 新增正則規則',
      onClick: () => {
        rules.push({
          id: `rule_${Date.now()}`,
          name: `規則 #${rules.length + 1}`,
          findRegex: '/<tag>[\\s\\S]*?<\\/tag>/gi',
          replaceString: '',
          enabled: true,
        });
        saveSettings();
        this.render();
      },
    });

    section.appendChild(
      el('div', { className: 'st-dtts-actions' }, [addRuleBtn, presetSelect]),
    );

    // Rules list
    const listEl = el('div', { className: 'st-dtts-rule-list' });
    if (rules.length === 0) {
      listEl.appendChild(
        el('div', {
          className: 'st-dtts-notice',
          text: '目前沒有設定任何正則規則，朗讀時將直接送出原文。',
        }),
      );
    }

    rules.forEach((rule, idx) => {
      const parsed = parseRulePattern(rule.findRegex);
      const isBad = parsed.kind === 'unsafe' || parsed.kind === 'invalid';

      const cb = el('input', { type: 'checkbox', 'aria-label': `啟用規則 ${rule.name}` });
      cb.checked = rule.enabled !== false;
      cb.addEventListener('change', () => {
        rule.enabled = cb.checked;
        saveSettings();
        this.render();
      });

      const nameInput = el('input', {
        type: 'text',
        className: 'st-dtts-input',
        placeholder: '規則名稱',
        'aria-label': `規則 ${idx + 1} 名稱`,
      });
      nameInput.value = rule.name || '';
      nameInput.addEventListener('input', () => {
        rule.name = nameInput.value;
        saveSettings();
      });

      const upBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn is-sm',
        text: '↑',
        disabled: idx === 0,
        'aria-label': `上移規則 ${rule.name || idx + 1}`,
        onClick: () => {
          [rules[idx - 1], rules[idx]] = [rules[idx], rules[idx - 1]];
          saveSettings();
          this.render();
        },
      });

      const downBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn is-sm',
        text: '↓',
        disabled: idx === rules.length - 1,
        'aria-label': `下移規則 ${rule.name || idx + 1}`,
        onClick: () => {
          [rules[idx + 1], rules[idx]] = [rules[idx], rules[idx + 1]];
          saveSettings();
          this.render();
        },
      });

      const delBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn is-sm is-danger',
        text: '刪除',
        'aria-label': `刪除規則 ${rule.name || idx + 1}`,
        onClick: () => {
          rules.splice(idx, 1);
          saveSettings();
          this.render();
        },
      });

      const findInput = el('input', {
        type: 'text',
        className: 'st-dtts-input is-mono',
        placeholder: '/pattern/gi 或純字串',
        'aria-label': `規則 ${idx + 1} 查找正則`,
      });
      findInput.value = rule.findRegex || '';
      findInput.addEventListener('change', () => {
        rule.findRegex = findInput.value;
        saveSettings();
        this.render();
      });

      const replaceInput = el('input', {
        type: 'text',
        className: 'st-dtts-input is-mono',
        placeholder: '替換字串（留空表示刪除，可用 $1）',
        'aria-label': `規則 ${idx + 1} 替換文字`,
      });
      replaceInput.value = rule.replaceString ?? '';
      replaceInput.addEventListener('change', () => {
        rule.replaceString = replaceInput.value;
        saveSettings();
        this.render();
      });

      // Live ReDoS / syntax feedback
      let safetyEl = null;
      if (isBad) {
        safetyEl = el('div', {
          className: 'st-dtts-notice is-error',
          text: `${parsed.kind === 'unsafe' ? 'ReDoS 防護攔截' : '語法錯誤'}：${parsed.error}`,
        });
      } else if (parsed.kind === 'regex') {
        const extra = analyzeRegexSafety(parsed.pattern);
        if (!extra.safe) {
          safetyEl = el('div', { className: 'st-dtts-notice is-warn', text: extra.warnings.join('；') });
        }
      }

      listEl.appendChild(
        el('div', { className: 'st-dtts-rule-item' }, [
          el('div', { className: 'st-dtts-rule-head' }, [cb, nameInput, upBtn, downBtn, delBtn]),
          el('div', { className: 'st-dtts-row' }, [
            el('div', { className: 'st-dtts-field' }, [
              el('label', { className: 'st-dtts-label', text: 'Find Regex（自動補 g）' }),
              findInput,
            ]),
            el('div', { className: 'st-dtts-field' }, [
              el('label', { className: 'st-dtts-label', text: 'Replace With' }),
              replaceInput,
            ]),
          ]),
          safetyEl,
        ]),
      );
    });

    section.appendChild(listEl);
    section.appendChild(el('div', { className: 'st-dtts-divider' }));

    // Before / After Comparison Panel (Manual Live Test vs Last Actual Read Snapshot)
    const compareSwitcher = el('div', { className: 'st-dtts-tabs' }, [
      el('button', {
        type: 'button',
        className: `st-dtts-tab ${this.compareTab === 'manual' ? 'is-active' : ''}`,
        text: '手動／即時測試檢視',
        onClick: () => {
          this.compareTab = 'manual';
          this.render();
        },
      }),
      el('button', {
        type: 'button',
        className: `st-dtts-tab ${this.compareTab === 'snapshot' ? 'is-active' : ''}`,
        text: this.lastSnapshot ? '最近一次朗讀快照 (已記錄)' : '最近一次朗讀快照',
        onClick: () => {
          this.compareTab = 'snapshot';
          this.render();
        },
      }),
    ]);

    section.appendChild(el('label', { className: 'st-dtts-label', text: '正則篩選前後可視化對比' }));
    section.appendChild(compareSwitcher);

    if (this.compareTab === 'manual') {
      const fetchBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn is-sm',
        text: '抓取最新一則聊天原文',
        onClick: async () => {
          const msg = await this.onFetchLatestRaw?.();
          if (msg && msg.text) {
            this.manualSampleText = msg.text;
            this.manualSourceLabel = msg.sourceLabel;
          } else {
            this.manualSourceLabel = msg?.sourceLabel || '找不到最新訊息';
          }
          this.render();
        },
      });

      const manualInput = el('textarea', {
        className: 'st-dtts-textarea is-mono',
        placeholder: '點擊上方「抓取最新一則聊天原文」或直接貼上 Raw 文本測試正則…',
        'aria-label': '手動測試原文輸入框',
      });
      manualInput.value = this.manualSampleText;
      manualInput.addEventListener('input', () => {
        this.manualSampleText = manualInput.value;
        this.manualSourceLabel = '手動貼上文本';
        // Re-render comparison output block cleanly without losing textarea focus
        const nextDiff = this._buildComparisonView({
          sourceLabel: this.manualSourceLabel,
          pipelineResult: runRegexPipeline(this.manualSampleText, this.settings.regexRules),
          chunks:
            this.settings.tts.playbackMode === 'sentence'
              ? splitIntoSentences(
                  runRegexPipeline(this.manualSampleText, this.settings.regexRules).cleanedText,
                  this.settings.tts.maxSentenceChars,
                )
              : null,
        });
        diffHolder.innerHTML = '';
        diffHolder.appendChild(nextDiff);
      });

      const pipelineResult = runRegexPipeline(this.manualSampleText, this.settings.regexRules);
      const chunks =
        this.settings.tts.playbackMode === 'sentence'
          ? splitIntoSentences(pipelineResult.cleanedText, this.settings.tts.maxSentenceChars)
          : null;

      const diffHolder = el('div', {}, [
        this._buildComparisonView({
          sourceLabel: this.manualSourceLabel,
          pipelineResult,
          chunks,
        }),
      ]);

      section.appendChild(el('div', { className: 'st-dtts-actions' }, [fetchBtn]));
      section.appendChild(manualInput);
      section.appendChild(diffHolder);
    } else {
      if (!this.lastSnapshot) {
        section.appendChild(
          el('div', {
            className: 'st-dtts-notice',
            text: '尚未執行過朗讀。雙擊任一聊天訊息並點擊「朗讀」或「重製朗讀」後，這裡會自動保存該次實際送讀的完整快照。',
          }),
        );
      } else {
        const snap = this.lastSnapshot;
        section.appendChild(
          this._buildComparisonView({
            sourceLabel: `${snap.sourceLabel} · ${snap.timestamp} · ${snap.actionLabel}`,
            pipelineResult: snap.pipelineResult,
            chunks: snap.chunks,
          }),
        );
      }
    }

    return section;
  }

  _buildComparisonView({ sourceLabel, pipelineResult, chunks }) {
    const wrap = el('div', { className: 'st-dtts-section' });

    wrap.appendChild(
      el('div', { className: 'st-dtts-compare-meta' }, [
        el('span', { text: `資料來源：${sourceLabel}` }),
        el('span', { text: '·', 'aria-hidden': 'true' }),
        el('span', { text: `篩選前 ${pipelineResult.rawLength} 字` }),
        el('span', { text: '→', 'aria-hidden': 'true' }),
        el('span', { text: `篩選後 ${pipelineResult.cleanedLength} 字` }),
      ]),
    );

    for (const warn of pipelineResult.warnings) {
      wrap.appendChild(el('div', { className: 'st-dtts-notice is-warn', text: warn }));
    }

    wrap.appendChild(
      el('div', { className: 'st-dtts-diff-grid' }, [
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: `篩選前原文（${pipelineResult.rawLength} 字）` }),
          el('pre', { className: 'st-dtts-codebox', text: pipelineResult.rawText || '（空）' }),
        ]),
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: `篩選後實際送給 TTS 的純正文（${pipelineResult.cleanedLength} 字）` }),
          el('pre', { className: 'st-dtts-codebox', text: pipelineResult.cleanedText || '（清洗後無可朗讀正文）' }),
        ]),
      ]),
    );

    if (pipelineResult.removedSegments.length > 0) {
      const removedBox = el(
        'div',
        { className: 'st-dtts-removed-list' },
        pipelineResult.removedSegments.slice(0, 8).map((seg) =>
          el('div', {
            className: 'st-dtts-removed-item',
            text: `[${seg.ruleName}] 剔除：\n${seg.text.length > 260 ? `${seg.text.slice(0, 260)}…` : seg.text}`,
          }),
        ),
      );
      wrap.appendChild(
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: `被剔除段落（共 ${pipelineResult.removedSegments.length} 處）` }),
          removedBox,
        ]),
      );
    }

    if (Array.isArray(chunks) && chunks.length > 0) {
      const details = el('details', {}, [
        el('summary', {
          className: 'st-dtts-label',
          style: 'cursor:pointer;padding:6px 0;',
          text: `展開實際切句清單（共 ${chunks.length} 句）`,
        }),
        el(
          'div',
          { className: 'st-dtts-chunk-list' },
          chunks.map((c, idx) =>
            el('div', { className: 'st-dtts-chunk-row' }, [
              el('span', { className: 'st-dtts-chunk-idx', text: `#${idx + 1}` }),
              el('span', { text: c }),
            ]),
          ),
        ),
      ]);
      wrap.appendChild(details);
    }

    return wrap;
  }

  /* ---------------- Tab 3: AI Regex Assistant (Agent) ---------------- */
  _renderAgentTab() {
    const section = el('div', { className: 'st-dtts-section' });
    const llm = this.settings.llm;

    // Avoid duplicate URL/Token entry: optional one-click share with TTS
    const reuseCb = el('input', { type: 'checkbox' });
    reuseCb.checked = Boolean(llm.reuseTtsAuth);
    reuseCb.addEventListener('change', () => {
      llm.reuseTtsAuth = reuseCb.checked;
      saveSettings();
      this.render();
    });

    section.appendChild(
      el('label', { className: 'st-dtts-checkbox' }, [
        reuseCb,
        el('span', { text: '共用 TTS 的 Base URL 與 API Key（免重複填寫）' }),
      ]),
    );

    const auth = getEffectiveLlmAuth(this.settings);
    const chatEp = resolveChatEndpoint(auth.baseUrl);

    if (!llm.reuseTtsAuth) {
      const llmUrlInput = el('input', {
        type: 'url',
        className: 'st-dtts-input is-mono',
        placeholder: 'https://api.openai.com/v1',
        'aria-label': 'LLM Base URL',
      });
      llmUrlInput.value = llm.baseUrl || '';
      llmUrlInput.addEventListener('input', () => {
        llm.baseUrl = llmUrlInput.value.trim();
        llmEpHint.textContent = resolveChatEndpoint(llm.baseUrl).valid
          ? `實際端點：${resolveChatEndpoint(llm.baseUrl).chatUrl}`
          : '支援填寫根網址、/v1 或 /v1/chat/completions';
        saveSettings();
      });

      const llmEpHint = el('div', {
        className: 'st-dtts-hint is-mono',
        text: chatEp.valid ? `實際端點：${chatEp.chatUrl}` : '支援填寫根網址、/v1 或 /v1/chat/completions',
      });

      const llmKeyInput = el('input', {
        type: this.showLlmKey ? 'text' : 'password',
        className: 'st-dtts-input is-mono',
        placeholder: 'LLM API Key',
        autocomplete: 'off',
        'aria-label': 'LLM API Key',
      });
      llmKeyInput.value = llm.apiKey || '';
      llmKeyInput.addEventListener('input', () => {
        llm.apiKey = llmKeyInput.value;
        saveSettings();
      });

      const revealBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn is-sm',
        text: this.showLlmKey ? '隱藏' : '顯示',
        onClick: () => {
          this.showLlmKey = !this.showLlmKey;
          this.render();
        },
      });

      section.appendChild(
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: 'LLM Base URL（專供正則助手使用）' }),
          llmUrlInput,
          llmEpHint,
        ]),
      );
      section.appendChild(
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: 'LLM API Key' }),
          el('div', { className: 'st-dtts-inline' }, [llmKeyInput, revealBtn]),
        ]),
      );
    } else {
      section.appendChild(
        el('div', {
          className: 'st-dtts-hint is-mono',
          text: chatEp.valid ? `已共用 TTS 連線 → ${chatEp.chatUrl}` : '請先於「TTS 與播放」填寫 Base URL',
        }),
      );
    }

    const llmModelInput = el('input', {
      type: 'text',
      className: 'st-dtts-input is-mono',
      placeholder: 'gpt-4o-mini',
      'aria-label': 'LLM 模型名稱',
    });
    llmModelInput.value = llm.model || 'gpt-4o-mini';
    llmModelInput.addEventListener('input', () => {
      llm.model = llmModelInput.value.trim();
      saveSettings();
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: 'LLM Model' }),
        llmModelInput,
      ]),
    );

    section.appendChild(el('div', { className: 'st-dtts-divider' }));

    // Custom instruction + One-click Fetch Latest & Generate button
    const promptInput = el('textarea', {
      className: 'st-dtts-textarea',
      placeholder: '選填補充需求（例如：只保留 <content> 內的正文、或移除底部的狀態表格）…',
      'aria-label': '給 AI 正則助手的補充指令',
    });
    promptInput.value = this.agentState.userPrompt;
    promptInput.addEventListener('input', () => {
      this.agentState.userPrompt = promptInput.value;
    });

    const runBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-primary',
      disabled: this.agentState.busy,
      text: this.agentState.busy ? '分析與沙盒驗證中…' : '抓取最新原文並自動生成正則',
      onClick: async () => {
        this.agentState.busy = true;
        this.agentState.errorText = '';
        this.agentState.statusText = '正在抓取最新一則 AI 訊息的 Raw 原文…';
        this.render();
        try {
          const res = await this.onRunAgent?.({
            userPrompt: this.agentState.userPrompt,
            onProgress: (msg) => {
              this.agentState.statusText = msg;
              this.render();
            },
          });
          this.agentState.result = res;
          this.agentState.sampleSourceLabel = res?.sourceLabel || '';
          this.agentState.statusText = res?.ok
            ? `已完成（經過 ${res.attempts} 輪沙盒實測驗證）`
            : '未能產生有效規則';
        } catch (err) {
          this.agentState.errorText = err?.message || 'AI 助手執行失敗';
          this.agentState.statusText = '';
        } finally {
          this.agentState.busy = false;
          this.render();
        }
      },
    });

    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: '補充指示（選填）' }),
        promptInput,
      ]),
    );
    section.appendChild(el('div', { className: 'st-dtts-actions' }, [runBtn]));

    if (this.agentState.statusText) {
      section.appendChild(el('div', { className: 'st-dtts-notice', text: this.agentState.statusText }));
    }
    if (this.agentState.errorText) {
      section.appendChild(el('div', { className: 'st-dtts-notice is-error', text: this.agentState.errorText }));
    }

    // Result preview card with Before -> After diff and One-Click Apply
    const res = this.agentState.result;
    if (res && res.rules && res.rules.length > 0) {
      const card = el('div', { className: 'st-dtts-agent-card' });

      if (res.analysis) {
        card.appendChild(el('div', { text: `設計說明：${res.analysis}` }));
      }

      const rulesPreview = res.rules
        .map((r, i) => `${i + 1}. ${r.name}\n   Find:    ${r.findRegex}\n   Replace: ${JSON.stringify(r.replaceString)}`)
        .join('\n');

      card.appendChild(
        el('div', { className: 'st-dtts-field' }, [
          el('label', { className: 'st-dtts-label', text: `建議規則（${res.rules.length} 條）` }),
          el('pre', { className: 'st-dtts-codebox', text: rulesPreview }),
        ]),
      );

      if (res.sandboxResult) {
        card.appendChild(
          this._buildComparisonView({
            sourceLabel: `${res.sourceLabel || '最新 AI 原文'}（沙盒實測）`,
            pipelineResult: res.sandboxResult,
            chunks: null,
          }),
        );
      }

      if (res.remainingIssues?.length) {
        card.appendChild(
          el('div', {
            className: 'st-dtts-notice is-warn',
            text: `沙盒提醒：${res.remainingIssues.join('；')}`,
          }),
        );
      }

      const applyReplaceBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn is-primary',
        text: '一鍵套用規則（覆蓋現有）',
        onClick: () => {
          this.settings.regexRules = structuredClone(res.rules);
          saveSettings();
          this.agentState.statusText = `已覆蓋套用 ${res.rules.length} 條規則並自動儲存。`;
          this.onSettingsChanged?.();
          this.render();
        },
      });

      const applyAppendBtn = el('button', {
        type: 'button',
        className: 'st-dtts-btn',
        text: '追加至規則清單',
        onClick: () => {
          this.settings.regexRules.push(...structuredClone(res.rules));
          saveSettings();
          this.agentState.statusText = `已追加 ${res.rules.length} 條規則並自動儲存。`;
          this.onSettingsChanged?.();
          this.render();
        },
      });

      card.appendChild(el('div', { className: 'st-dtts-actions' }, [applyReplaceBtn, applyAppendBtn]));
      section.appendChild(card);
    }

    return section;
  }
}
