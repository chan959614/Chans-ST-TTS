/**
 * ST Direct TTS — Native DOM UI Controller
 * Renders:
 * 1. Refined dark-glass 2-item context menu with crisp SVG icons (viewport-clamped, 150ms shield)
 * 2. Draggable, edge-snapping Floating Orb Player (single-tap pause/resume/unlock, corner × & long-press stop)
 * 3. SillyTavern #extensions_settings2 inline-drawer panel with independent TTS & LLM Profile Managers
 *
 * All user-supplied strings are inserted via textContent / value properties (zero XSS).
 */

import { DEFAULT_MODELS, FALLBACK_VOICES, REGEX_PRESETS, RESPONSE_FORMATS } from './constants.js';
import { analyzeRegexSafety, parseRulePattern, runRegexPipeline, splitIntoSentences } from './regexEngine.js';
import {
  addLlmProfile,
  addTtsProfile,
  deleteLlmProfile,
  deleteTtsProfile,
  renameLlmProfile,
  renameTtsProfile,
  resetAll,
  resetKeepCredentials,
  saveSettings,
  selectLlmProfile,
  selectTtsProfile,
  syncActiveLlmProfile,
  syncActiveTtsProfile,
} from './storage.js';
import { fetchVoicesFromServer, resolveChatEndpoint, resolveTtsEndpoints } from './ttsClient.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const add = (tag, attrs) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.appendChild(n);
  };

  if (name === 'play') {
    add('polygon', { points: '7 4 20 12 7 20 7 4', fill: 'currentColor', stroke: 'none' });
  } else if (name === 'pause') {
    add('rect', { x: '6', y: '5', width: '4', height: '14', rx: '1', fill: 'currentColor', stroke: 'none' });
    add('rect', { x: '14', y: '5', width: '4', height: '14', rx: '1', fill: 'currentColor', stroke: 'none' });
  } else if (name === 'refresh') {
    add('path', { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' });
    add('path', { d: 'M3 3v5h5' });
  } else if (name === 'speaker') {
    add('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' });
    add('path', { d: 'M15.5 8.5a5 5 0 0 1 0 7' });
    add('path', { d: 'M19 5a10 10 0 0 1 0 14' });
  } else if (name === 'close') {
    add('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
    add('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
  } else if (name === 'loader') {
    add('path', { d: 'M21 12a9 9 0 1 1-6.2-8.56' });
  } else if (name === 'alert') {
    add('circle', { cx: '12', cy: '12', r: '9' });
    add('line', { x1: '12', y1: '8', x2: '12', y2: '12' });
    add('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' });
  }
  return svg;
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
      if (Date.now() - this.openedAt < 150) {
        ev.preventDefault?.();
        return;
      }
      this.close();
    };
    backdrop.addEventListener('pointerdown', dismissIfSafe);
    backdrop.addEventListener('click', dismissIfSafe);

    const btnRead = el(
      'button',
      {
        type: 'button',
        className: 'st-dtts-menu-btn',
        role: 'menuitem',
        onClick: (ev) => {
          ev.stopPropagation();
          this.close();
          this.onRead?.(mesElement);
        },
      },
      [createIcon('speaker'), el('span', { text: '朗讀' })],
    );

    const btnReread = el(
      'button',
      {
        type: 'button',
        className: 'st-dtts-menu-btn',
        role: 'menuitem',
        onClick: (ev) => {
          ev.stopPropagation();
          this.close();
          this.onReread?.(mesElement);
        },
      },
      [createIcon('refresh'), el('span', { text: '重製朗讀' })],
    );

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
 * 2. Refined Draggable Edge-Snapping Floating Orb Player
 *    - Single-tap orb: Pause / Resume / Unlock NotAllowedError / Dismiss Error
 *    - Corner × button OR 480ms long-press: Stop & collapse immediately
 *    - Drag freely and auto-snap to left/right edge, persisting position
 * ============================================================================ */
const ORB_RADIUS = 23;
const ORB_CIRCUMFERENCE = 2 * Math.PI * ORB_RADIUS;
const ORB_SIZE = 52;
const ORB_EDGE_MARGIN = 14;

export class FloatingOrbPlayer {
  constructor({ initialPosition, onPrimaryTap, onStop, onPositionChange }) {
    this.onPrimaryTap = onPrimaryTap;
    this.onStop = onStop;
    this.onPositionChange = onPositionChange;

    this.position = {
      side: initialPosition?.side === 'left' ? 'left' : 'right',
      topRatio:
        typeof initialPosition?.topRatio === 'number' && initialPosition.topRatio >= 0.08 && initialPosition.topRatio <= 0.9
          ? initialPosition.topRatio
          : 0.72,
    };

    // SVG circular progress ring
    const ringSvg = document.createElementNS(SVG_NS, 'svg');
    ringSvg.setAttribute('class', 'st-dtts-orb-ring');
    ringSvg.setAttribute('viewBox', '0 0 52 52');
    ringSvg.setAttribute('aria-hidden', 'true');

    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'st-dtts-orb-ring-track');
    track.setAttribute('cx', '26');
    track.setAttribute('cy', '26');
    track.setAttribute('r', String(ORB_RADIUS));

    const progress = document.createElementNS(SVG_NS, 'circle');
    progress.setAttribute('class', 'st-dtts-orb-ring-progress');
    progress.setAttribute('cx', '26');
    progress.setAttribute('cy', '26');
    progress.setAttribute('r', String(ORB_RADIUS));
    progress.setAttribute('stroke-dasharray', String(ORB_CIRCUMFERENCE));
    progress.setAttribute('stroke-dashoffset', String(ORB_CIRCUMFERENCE));

    ringSvg.appendChild(track);
    ringSvg.appendChild(progress);
    this.progressCircle = progress;

    this.iconHost = el('span', { className: 'st-dtts-orb-icon' });
    this.orbBtn = el(
      'button',
      {
        type: 'button',
        className: 'st-dtts-orb-btn',
        'aria-label': '語音朗讀懸浮球：單擊暫停或繼續，長按停止',
      },
      [ringSvg, this.iconHost],
    );

    this.stopBtn = el(
      'button',
      {
        type: 'button',
        className: 'st-dtts-orb-stop',
        'aria-label': '停止朗讀',
        title: '停止朗讀',
      },
      [createIcon('close')],
    );
    this.stopBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.stopBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onStop?.();
    });

    this.toastEl = el('div', { className: 'st-dtts-orb-toast', hidden: true });
    this.captionEl = el('div', { className: 'st-dtts-orb-caption' });

    this.root = el(
      'div',
      {
        className: 'st-dtts-orb-root is-right',
        role: 'region',
        'aria-label': '語音朗讀懸浮球控制',
        'data-testid': 'st-dtts-floating-orb',
        hidden: true,
      },
      [
        el('div', { className: 'st-dtts-orb-shell' }, [this.toastEl, this.orbBtn, this.stopBtn]),
        this.captionEl,
      ],
    );

    document.body.appendChild(this.root);
    this._applySnappedPosition();
    this._bindDragAndTap();

    this._onResize = () => this._applySnappedPosition();
    window.addEventListener('resize', this._onResize);
  }

  _applySnappedPosition() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = this.position.side === 'left' ? ORB_EDGE_MARGIN : Math.max(ORB_EDGE_MARGIN, vw - ORB_SIZE - ORB_EDGE_MARGIN);
    const minTop = 58;
    const maxTop = Math.max(minTop, vh - 96);
    const top = Math.min(maxTop, Math.max(minTop, Math.round(vh * this.position.topRatio)));

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.classList.toggle('is-left', this.position.side === 'left');
    this.root.classList.toggle('is-right', this.position.side !== 'left');
  }

  _bindDragAndTap() {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let dragged = false;
    let longPressFired = false;
    let longPressTimer = null;

    const clearLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    this.orbBtn.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      const rect = this.root.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      dragged = false;
      longPressFired = false;

      try {
        this.orbBtn.setPointerCapture(pointerId);
      } catch {
        // Ignore capture failure on synthetic events
      }

      clearLongPress();
      longPressTimer = setTimeout(() => {
        if (!dragged) {
          longPressFired = true;
          this.onStop?.();
        }
      }, 480);
    });

    this.orbBtn.addEventListener('pointermove', (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragged && Math.hypot(dx, dy) > 6) {
        dragged = true;
        clearLongPress();
        this.root.classList.add('is-dragging');
      }
      if (dragged) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const nextLeft = Math.min(vw - ORB_SIZE - 8, Math.max(8, originLeft + dx));
        const nextTop = Math.min(vh - 88, Math.max(48, originTop + dy));
        this.root.style.left = `${Math.round(nextLeft)}px`;
        this.root.style.top = `${Math.round(nextTop)}px`;
      }
    });

    const finishPointer = (ev, cancelled = false) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      clearLongPress();
      try {
        this.orbBtn.releasePointerCapture(pointerId);
      } catch {
        // Ignore release errors
      }
      pointerId = null;

      if (dragged) {
        this.root.classList.remove('is-dragging');
        const rect = this.root.getBoundingClientRect();
        const centerX = rect.left + ORB_SIZE / 2;
        this.position = {
          side: centerX < window.innerWidth / 2 ? 'left' : 'right',
          topRatio: Math.min(0.88, Math.max(0.1, rect.top / Math.max(1, window.innerHeight))),
        };
        this._applySnappedPosition();
        this.onPositionChange?.(this.position);
      } else if (!cancelled && !longPressFired) {
        this.onPrimaryTap?.();
      }
    };

    this.orbBtn.addEventListener('pointerup', (ev) => finishPointer(ev, false));
    this.orbBtn.addEventListener('pointercancel', (ev) => finishPointer(ev, true));

    // Keyboard accessibility (Enter / Space)
    this.orbBtn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.onPrimaryTap?.();
      }
    });
  }

  render(state, visible = true) {
    if (!visible || state.status === 'idle') {
      this.root.hidden = true;
      return;
    }

    this.root.hidden = false;
    this.root.classList.toggle('is-loading', state.status === 'loading');
    this.root.classList.toggle('is-blocked', state.status === 'blocked');
    this.root.classList.toggle('is-error', state.status === 'error');

    // Update center icon
    this.iconHost.innerHTML = '';
    if (state.status === 'playing') {
      this.iconHost.appendChild(createIcon('pause'));
      this.orbBtn.setAttribute('aria-label', '暫停朗讀（長按或點右上角關閉停止）');
    } else if (state.status === 'paused' || state.status === 'blocked') {
      this.iconHost.appendChild(createIcon('play'));
      this.orbBtn.setAttribute(
        'aria-label',
        state.status === 'blocked' ? '點擊繼續播放（解鎖瀏覽器自動播放）' : '繼續朗讀',
      );
    } else if (state.status === 'error') {
      this.iconHost.appendChild(createIcon('alert'));
      this.orbBtn.setAttribute('aria-label', '朗讀發生錯誤，點擊關閉');
    } else {
      this.iconHost.appendChild(createIcon('loader'));
      this.orbBtn.setAttribute('aria-label', '語音合成載入中');
    }

    // Update SVG progress ring
    let fraction = 0;
    if (state.status === 'loading') {
      fraction = 0.28;
    } else if (state.status === 'blocked' || state.status === 'error') {
      fraction = 1;
    } else if (state.totalChunks > 0) {
      fraction = Math.min(1, Math.max(0.08, state.currentIndex / state.totalChunks));
    }
    this.progressCircle.setAttribute('stroke-dashoffset', String(ORB_CIRCUMFERENCE * (1 - fraction)));

    // Compact micro-caption under orb
    if (state.status === 'blocked') {
      this.captionEl.textContent = '點擊繼續';
    } else if (state.status === 'error') {
      this.captionEl.textContent = '朗讀失敗';
    } else if (state.status === 'paused') {
      this.captionEl.textContent = state.totalChunks > 1 ? `暫停 ${state.currentIndex}/${state.totalChunks}` : '已暫停';
    } else if (state.status === 'loading') {
      this.captionEl.textContent = state.totalChunks > 1 ? `載入 ${state.currentIndex}/${state.totalChunks}` : '合成中';
    } else {
      this.captionEl.textContent = state.totalChunks > 1 ? `${state.currentIndex}/${state.totalChunks}` : '播放中';
    }

    // Show side toast only on blocked/error so normal playback stays sleek and minimal
    if ((state.status === 'blocked' || state.status === 'error') && state.errorMessage) {
      this.toastEl.hidden = false;
      this.toastEl.textContent = state.errorMessage;
    } else {
      this.toastEl.hidden = true;
      this.toastEl.textContent = '';
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }
}

/* ============================================================================
 * 3. Extension Settings Panel (#extensions_settings2)
 *    - Independent TTS Multi-Profile Manager
 *    - Independent LLM Multi-Profile Manager (Zero shared-auth checkbox)
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

    // Inline profile editor state (no window.prompt!)
    this.ttsProfileEditor = null; // { mode: 'add' | 'rename', value: string } | null
    this.llmProfileEditor = null; // { mode: 'add' | 'rename', value: string } | null
    this.profileFeedback = { tts: '', llm: '' };

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
    if (this.activeTab === 'regex') this.render();
  }

  refreshCacheStats() {
    if (this.activeTab === 'tts') this.render();
  }

  render() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = '';

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

  /**
   * Reusable profile selector bar for both TTS and LLM (strictly independent stores).
   */
  _renderProfileManager({
    kind,
    title,
    ariaLabel,
    profiles,
    activeId,
    editorState,
    onSelect,
    onOpenEditor,
    onConfirmEditor,
    onCancelEditor,
    onDelete,
  }) {
    const activeProfile = profiles.find((p) => p.id === activeId) || profiles[0];
    const select = el(
      'select',
      { className: 'st-dtts-select', 'aria-label': ariaLabel },
      profiles.map((p) => el('option', { value: p.id, text: p.name })),
    );
    select.value = activeProfile?.id || '';
    select.addEventListener('change', () => onSelect(select.value));

    const bar = el('div', { className: 'st-dtts-profile-bar' }, [
      el('div', { className: 'st-dtts-profile-head' }, [
        el('span', { className: 'st-dtts-profile-title', text: title }),
        el('span', { className: 'st-dtts-profile-count', text: `共 ${profiles.length} 組` }),
      ]),
      select,
      el('div', { className: 'st-dtts-actions' }, [
        el('button', {
          type: 'button',
          className: 'st-dtts-btn is-sm',
          text: '+ 新增方案',
          onClick: () => onOpenEditor('add', ''),
        }),
        el('button', {
          type: 'button',
          className: 'st-dtts-btn is-sm',
          text: '更名',
          onClick: () => onOpenEditor('rename', activeProfile?.name || ''),
        }),
        el('button', {
          type: 'button',
          className: 'st-dtts-btn is-sm is-danger',
          text: '刪除',
          disabled: profiles.length <= 1,
          onClick: () => onDelete(activeProfile.id),
        }),
      ]),
    ]);

    if (editorState) {
      const nameInput = el('input', {
        type: 'text',
        className: 'st-dtts-input',
        placeholder: editorState.mode === 'add' ? '輸入新方案名稱（例如：Edge Worker、Fish Audio）' : '輸入新的方案名稱',
        'aria-label': `${title}名稱輸入`,
      });
      nameInput.value = editorState.value;
      nameInput.addEventListener('input', () => {
        editorState.value = nameInput.value;
      });
      nameInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          onConfirmEditor(nameInput.value);
        } else if (ev.key === 'Escape') {
          onCancelEditor();
        }
      });

      bar.appendChild(
        el('div', { className: 'st-dtts-inline-editor' }, [
          nameInput,
          el('button', {
            type: 'button',
            className: 'st-dtts-btn is-sm is-primary',
            text: editorState.mode === 'add' ? '建立' : '儲存名稱',
            onClick: () => onConfirmEditor(nameInput.value),
          }),
          el('button', {
            type: 'button',
            className: 'st-dtts-btn is-sm',
            text: '取消',
            onClick: () => onCancelEditor(),
          }),
        ]),
      );
    }

    if (this.profileFeedback[kind]) {
      bar.appendChild(el('div', { className: 'st-dtts-hint', text: this.profileFeedback[kind] }));
    }

    return bar;
  }

  /* ---------------- Tab 1: TTS Multi-Profile, Playback & Reset ---------------- */
  _renderTtsTab() {
    const s = this.settings.tts;
    const section = el('div', { className: 'st-dtts-section' });

    // Independent TTS Profile Manager
    section.appendChild(
      this._renderProfileManager({
        kind: 'tts',
        title: 'TTS 連線方案（快速切換）',
        ariaLabel: '切換 TTS 設定檔',
        profiles: this.settings.ttsProfiles,
        activeId: this.settings.activeTtsProfileId,
        editorState: this.ttsProfileEditor,
        onSelect: (id) => {
          selectTtsProfile(id, this.settings);
          this.ttsProfileEditor = null;
          this.profileFeedback.tts = '';
          this.voiceStatus = '';
          this.render();
        },
        onOpenEditor: (mode, value) => {
          this.ttsProfileEditor = { mode, value };
          this.profileFeedback.tts = '';
          this.render();
        },
        onConfirmEditor: (val) => {
          if (this.ttsProfileEditor?.mode === 'add') {
            const created = addTtsProfile(val, { cloneCurrent: false }, this.settings);
            this.profileFeedback.tts = `已建立並切換至「${created.name}」`;
          } else if (this.ttsProfileEditor?.mode === 'rename') {
            renameTtsProfile(this.settings.activeTtsProfileId, val, this.settings);
            this.profileFeedback.tts = `已更名為「${val.trim()}」`;
          }
          this.ttsProfileEditor = null;
          this.render();
        },
        onCancelEditor: () => {
          this.ttsProfileEditor = null;
          this.render();
        },
        onDelete: (id) => {
          if (deleteTtsProfile(id, this.settings)) {
            this.profileFeedback.tts = '已刪除該 TTS 方案';
            this.render();
          }
        },
      }),
    );

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
      syncActiveTtsProfile(this.settings);
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
      syncActiveTtsProfile(this.settings);
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
      syncActiveTtsProfile(this.settings);
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
      syncActiveTtsProfile(this.settings);
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

    // Voice selector + custom input + /v1/voices loader
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
      syncActiveTtsProfile(this.settings);
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
      syncActiveTtsProfile(this.settings);
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
      className: 'st-dtts-range',
      min: '0.25',
      max: '4',
      step: '0.05',
      'aria-label': '語速倍率',
    });
    speedInput.value = String(s.speed ?? 1.0);
    speedInput.addEventListener('input', () => {
      s.speed = Number(speedInput.value);
      speedVal.textContent = `${s.speed.toFixed(2)}x`;
      syncActiveTtsProfile(this.settings);
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
      syncActiveTtsProfile(this.settings);
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
      const pitchInput = el('input', {
        type: 'range',
        className: 'st-dtts-range',
        min: '-100',
        max: '100',
        step: '5',
        'aria-label': '音調 pitch',
      });
      pitchInput.value = String(s.pitch ?? 0);
      pitchInput.addEventListener('input', () => {
        s.pitch = Number(pitchInput.value);
        pitchVal.textContent = `${s.pitch}%`;
        syncActiveTtsProfile(this.settings);
      });

      const volVal = el('span', { className: 'is-mono', text: `${s.volume ?? 100}%` });
      const volInput = el('input', {
        type: 'range',
        className: 'st-dtts-range',
        min: '-100',
        max: '100',
        step: '5',
        'aria-label': '音量 volume',
      });
      volInput.value = String(s.volume ?? 100);
      volInput.addEventListener('input', () => {
        s.volume = Number(volInput.value);
        volVal.textContent = `${s.volume}%`;
        syncActiveTtsProfile(this.settings);
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

    // Two explicit Reset Options (preserves all TTS/LLM profiles vs full factory wipe)
    const resetKeepBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn',
      text: '恢復預設（保留 URL 與 Token）',
      onClick: () => {
        resetKeepCredentials(this.settings);
        this.pendingFullResetConfirm = false;
        this.resetFeedback = '已恢復播放參數與正則為預設值，所有已儲存的 TTS／LLM 方案與 Token 均已保留。';
        this.onAfterReset?.();
        this.render();
      },
    });

    const resetAllBtn = el('button', {
      type: 'button',
      className: 'st-dtts-btn is-danger',
      text: '完全重設（清除全部含設定檔）',
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
          el('div', { text: '確定要完全重設？這將同時清空所有 TTS 與 LLM 設定檔（含 URL 與 Token）。' }),
          el('div', { className: 'st-dtts-actions' }, [
            el('button', {
              type: 'button',
              className: 'st-dtts-btn is-sm is-danger',
              text: '確認完全重設',
              onClick: () => {
                resetAll(this.settings);
                this.pendingFullResetConfirm = false;
                this.resetFeedback = '已清除所有設定檔與規則，恢復出廠預設值。';
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

    section.appendChild(el('div', { className: 'st-dtts-actions' }, [addRuleBtn, presetSelect]));

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
        const nextPipe = runRegexPipeline(this.manualSampleText, this.settings.regexRules);
        const nextDiff = this._buildComparisonView({
          sourceLabel: this.manualSourceLabel,
          pipelineResult: nextPipe,
          chunks:
            this.settings.tts.playbackMode === 'sentence'
              ? splitIntoSentences(nextPipe.cleanedText, this.settings.tts.maxSentenceChars)
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

  /* ---------------- Tab 3: AI Regex Assistant (Independent LLM Multi-Profile) ---------------- */
  _renderAgentTab() {
    const section = el('div', { className: 'st-dtts-section' });
    const llm = this.settings.llm;

    // Independent LLM Profile Manager (zero coupling with TTS)
    section.appendChild(
      this._renderProfileManager({
        kind: 'llm',
        title: 'LLM 連線方案（獨立於 TTS，快速切換）',
        ariaLabel: '切換 LLM 設定檔',
        profiles: this.settings.llmProfiles,
        activeId: this.settings.activeLlmProfileId,
        editorState: this.llmProfileEditor,
        onSelect: (id) => {
          selectLlmProfile(id, this.settings);
          this.llmProfileEditor = null;
          this.profileFeedback.llm = '';
          this.render();
        },
        onOpenEditor: (mode, value) => {
          this.llmProfileEditor = { mode, value };
          this.profileFeedback.llm = '';
          this.render();
        },
        onConfirmEditor: (val) => {
          if (this.llmProfileEditor?.mode === 'add') {
            const created = addLlmProfile(val, { cloneCurrent: false }, this.settings);
            this.profileFeedback.llm = `已建立並切換至「${created.name}」`;
          } else if (this.llmProfileEditor?.mode === 'rename') {
            renameLlmProfile(this.settings.activeLlmProfileId, val, this.settings);
            this.profileFeedback.llm = `已更名為「${val.trim()}」`;
          }
          this.llmProfileEditor = null;
          this.render();
        },
        onCancelEditor: () => {
          this.llmProfileEditor = null;
          this.render();
        },
        onDelete: (id) => {
          if (deleteLlmProfile(id, this.settings)) {
            this.profileFeedback.llm = '已刪除該 LLM 方案';
            this.render();
          }
        },
      }),
    );

    const chatEp = resolveChatEndpoint(llm.baseUrl);
    const llmEpHint = el('div', {
      className: 'st-dtts-hint is-mono',
      text: chatEp.valid ? `實際端點：${chatEp.chatUrl}` : '支援填寫根網址、/v1 或 /v1/chat/completions',
    });

    const llmUrlInput = el('input', {
      type: 'url',
      className: 'st-dtts-input is-mono',
      placeholder: 'https://api.openai.com/v1',
      'aria-label': 'LLM Base URL',
    });
    llmUrlInput.value = llm.baseUrl || '';
    llmUrlInput.addEventListener('input', () => {
      llm.baseUrl = llmUrlInput.value.trim();
      const nextEp = resolveChatEndpoint(llm.baseUrl);
      llmEpHint.textContent = nextEp.valid
        ? `實際端點：${nextEp.chatUrl}`
        : '支援填寫根網址、/v1 或 /v1/chat/completions';
      syncActiveLlmProfile(this.settings);
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
      syncActiveLlmProfile(this.settings);
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

    const llmModelInput = el('input', {
      type: 'text',
      className: 'st-dtts-input is-mono',
      placeholder: 'gpt-4o-mini',
      'aria-label': 'LLM 模型名稱',
    });
    llmModelInput.value = llm.model || 'gpt-4o-mini';
    llmModelInput.addEventListener('input', () => {
      llm.model = llmModelInput.value.trim();
      syncActiveLlmProfile(this.settings);
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
    section.appendChild(
      el('div', { className: 'st-dtts-field' }, [
        el('label', { className: 'st-dtts-label', text: 'LLM Model' }),
        llmModelInput,
      ]),
    );

    section.appendChild(el('div', { className: 'st-dtts-divider' }));

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
