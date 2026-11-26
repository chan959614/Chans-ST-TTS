/**
 * ST Direct TTS — Double-Click & Android Touch Double-Tap Gesture Detector.
 *
 * Covers:
 * - Entire .mes container (both .mes_text and surrounding whitespace/margins)
 * - Same-origin embedded iframes inside .mes (with automatic coordinate translation)
 * - Desktop native `dblclick` + Mobile/TauriTavern single-finger `touchend` (<280ms, <18px)
 * - Scroll/drag rejection (<12px start->end delta)
 * - Shared 350ms cooldown lock to prevent double-firing on hybrid touch devices
 * - Smart exclusion of interactive elements & active text selection
 */

const DOUBLE_TAP_MAX_DELAY_MS = 280;
const DOUBLE_TAP_MAX_DIST_PX = 18;
const TAP_MAX_DRAG_PX = 12;
const SHARED_COOLDOWN_MS = 350;

const IGNORED_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG', 'PATH', 'LABEL', 'VIDEO', 'AUDIO']);

const IGNORED_SELECTORS = [
  '.mes_buttons',
  '.extraMesButtons',
  '.mes_button',
  '.swipe_left',
  '.swipe_right',
  '.swipes-counter',
  '.mes_edit_buttons',
  '.mes_reasoning_header',
  '.st-dtts-menu',
  '.st-dtts-player',
  '[contenteditable="true"]',
].join(',');

/**
 * Determine whether a click/tap target should be ignored to prevent accidental triggers.
 * Note: For desktop `dblclick`, browsers automatically select the word under the cursor on
 * the 2nd mousedown BEFORE dispatching `dblclick`, so `checkSelection` must only be enabled
 * for touch events or when verifying pre-existing intentional drag selections.
 */
export function shouldIgnoreTarget(target, ownerDoc = document, { checkSelection = true } = {}) {
  if (!target || target.nodeType !== 1) return false;

  if (checkSelection) {
    try {
      const win = ownerDoc?.defaultView || window;
      const sel = win?.getSelection?.()?.toString?.() || '';
      if (sel.trim().length > 0) return true;
    } catch {
      // Ignore selection read errors
    }
  }

  let el = target;
  while (el && el.nodeType === 1) {
    if (IGNORED_TAGS.has(el.tagName)) return true;
    if (el.matches?.(IGNORED_SELECTORS)) return true;
    // Stop walking once we reach the .mes floor container itself
    if (el.classList?.contains('mes')) break;
    el = el.parentElement;
  }

  return false;
}

export class MessageGestureHandler {
  constructor({ rootSelector = '#chat', isEnabled = () => true, onTrigger }) {
    this.rootSelector = rootSelector;
    this.isEnabled = isEnabled;
    this.onTrigger = onTrigger;

    this.lastTriggeredAt = 0;
    this.boundIframes = new WeakSet();
    this.cleanups = [];
    this.observer = null;

    // Mouse drag-selection tracker (prevents browser dblclick auto-word-select false positives)
    this.mouseDownPos = null;
    this.mouseDraggedSelection = false;

    // Single-finger touch state
    this.touchStartPos = null;
    this.touchCancelled = false;
    this.lastTap = null;
  }

  attach() {
    this.detach();

    const onDocMouseDown = (ev) => this._handleMouseDown(ev);
    const onDocMouseUp = (ev) => this._handleMouseUp(ev, document);
    const onDocDblClick = (ev) => this._handleDblClick(ev, document, null);
    const onDocTouchStart = (ev) => this._handleTouchStart(ev);
    const onDocTouchMove = (ev) => this._handleTouchMove(ev);
    const onDocTouchEnd = (ev) => this._handleTouchEnd(ev, document, null);

    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('mouseup', onDocMouseUp, true);
    document.addEventListener('dblclick', onDocDblClick, true);
    document.addEventListener('touchstart', onDocTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onDocTouchMove, { passive: true, capture: true });
    document.addEventListener('touchend', onDocTouchEnd, { passive: true, capture: true });

    this.cleanups.push(() => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('mouseup', onDocMouseUp, true);
      document.removeEventListener('dblclick', onDocDblClick, true);
      document.removeEventListener('touchstart', onDocTouchStart, true);
      document.removeEventListener('touchmove', onDocTouchMove, true);
      document.removeEventListener('touchend', onDocTouchEnd, true);
    });

    this.scanIframes();

    // Watch for newly rendered messages & embedded same-origin iframes
    const observeTarget = document.querySelector(this.rootSelector) || document.body;
    if (observeTarget && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => this.scanIframes());
      this.observer.observe(observeTarget, { childList: true, subtree: true });
    }
  }

  detach() {
    for (const fn of this.cleanups) {
      try {
        fn();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.cleanups = [];
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.boundIframes = new WeakSet();
  }

  /**
   * Bind listeners to all same-origin iframes residing inside .mes message floors.
   */
  scanIframes() {
    const root = document.querySelector(this.rootSelector) || document;
    const iframes = root.querySelectorAll('.mes iframe');
    for (const iframe of iframes) {
      if (this.boundIframes.has(iframe)) continue;
      this.boundIframes.add(iframe);

      const bindBody = () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc || !doc.body) return;
          const mesEl = iframe.closest('.mes');
          if (!mesEl) return;

          const onMDown = (ev) => this._handleMouseDown(ev);
          const onMUp = (ev) => this._handleMouseUp(ev, doc);
          const onDbl = (ev) => this._handleDblClick(ev, doc, iframe);
          const onStart = (ev) => this._handleTouchStart(ev);
          const onMove = (ev) => this._handleTouchMove(ev);
          const onEnd = (ev) => this._handleTouchEnd(ev, doc, iframe);

          doc.body.addEventListener('mousedown', onMDown, true);
          doc.body.addEventListener('mouseup', onMUp, true);
          doc.body.addEventListener('dblclick', onDbl, true);
          doc.body.addEventListener('touchstart', onStart, { passive: true, capture: true });
          doc.body.addEventListener('touchmove', onMove, { passive: true, capture: true });
          doc.body.addEventListener('touchend', onEnd, { passive: true, capture: true });

          this.cleanups.push(() => {
            try {
              doc.body?.removeEventListener('mousedown', onMDown, true);
              doc.body?.removeEventListener('mouseup', onMUp, true);
              doc.body?.removeEventListener('dblclick', onDbl, true);
              doc.body?.removeEventListener('touchstart', onStart, true);
              doc.body?.removeEventListener('touchmove', onMove, true);
              doc.body?.removeEventListener('touchend', onEnd, true);
            } catch {
              // Iframe may already be detached
            }
          });
        } catch {
          // Cross-origin iframe: safely ignore SecurityError
        }
      };

      bindBody();
      iframe.addEventListener('load', bindBody);
      this.cleanups.push(() => iframe.removeEventListener('load', bindBody));
    }
  }

  _resolveMesElement(target, iframe) {
    if (iframe) return iframe.closest('.mes');
    return target?.closest?.('.mes') || null;
  }

  _translateCoords(clientX, clientY, iframe) {
    if (!iframe) return { x: clientX, y: clientY };
    const rect = iframe.getBoundingClientRect();
    return {
      x: rect.left + clientX,
      y: rect.top + clientY,
    };
  }

  _fire(mesEl, x, y, sourceEvent) {
    const now = Date.now();
    if (now - this.lastTriggeredAt < SHARED_COOLDOWN_MS) return;
    this.lastTriggeredAt = now;
    this.lastTap = null;

    if (typeof this.onTrigger === 'function') {
      this.onTrigger({ mesElement: mesEl, x, y, sourceEvent });
    }
  }

  _handleMouseDown(ev) {
    if (ev.detail === 1) {
      this.mouseDownPos = { x: ev.clientX, y: ev.clientY };
      this.mouseDraggedSelection = false;
    }
  }

  _handleMouseUp(ev, ownerDoc) {
    if (!this.mouseDownPos) return;
    const dist = Math.hypot(ev.clientX - this.mouseDownPos.x, ev.clientY - this.mouseDownPos.y);
    if (dist > 6) {
      try {
        const win = ownerDoc?.defaultView || window;
        const sel = win?.getSelection?.()?.toString?.() || '';
        if (sel.trim().length > 0) {
          this.mouseDraggedSelection = true;
        }
      } catch {
        // Ignore selection read errors
      }
    }
  }

  _handleDblClick(ev, ownerDoc, iframe) {
    if (!this.isEnabled()) return;
    if (this.mouseDraggedSelection) return;

    const mesEl = this._resolveMesElement(ev.target, iframe);
    if (!mesEl) return;
    // Do not treat browser's automatic single-word selection on dblclick as an active user selection
    if (shouldIgnoreTarget(ev.target, ownerDoc, { checkSelection: false })) return;

    // Clear accidental single-word highlight created by the browser's native double-click
    try {
      const win = ownerDoc?.defaultView || window;
      win?.getSelection?.()?.removeAllRanges?.();
    } catch {
      // Ignore selection clear errors
    }

    const { x, y } = this._translateCoords(ev.clientX, ev.clientY, iframe);
    this._fire(mesEl, x, y, ev);
  }

  _handleTouchStart(ev) {
    if (!this.isEnabled()) return;
    if (ev.touches.length !== 1) {
      this.touchCancelled = true;
      this.touchStartPos = null;
      return;
    }
    const t = ev.touches[0];
    this.touchCancelled = false;
    this.touchStartPos = { x: t.clientX, y: t.clientY, time: Date.now() };
  }

  _handleTouchMove(ev) {
    if (!this.touchStartPos || this.touchCancelled) return;
    if (ev.touches.length !== 1) {
      this.touchCancelled = true;
      return;
    }
    const t = ev.touches[0];
    const dist = Math.hypot(t.clientX - this.touchStartPos.x, t.clientY - this.touchStartPos.y);
    if (dist > TAP_MAX_DRAG_PX) {
      this.touchCancelled = true;
    }
  }

  _handleTouchEnd(ev, ownerDoc, iframe) {
    if (!this.isEnabled()) return;
    if (this.touchCancelled || !this.touchStartPos) {
      this.touchStartPos = null;
      return;
    }
    if (ev.touches.length > 0 || ev.changedTouches.length !== 1) {
      this.touchStartPos = null;
      return;
    }

    const t = ev.changedTouches[0];
    const dragDist = Math.hypot(t.clientX - this.touchStartPos.x, t.clientY - this.touchStartPos.y);
    this.touchStartPos = null;
    if (dragDist > TAP_MAX_DRAG_PX) {
      this.lastTap = null;
      return;
    }

    const mesEl = this._resolveMesElement(ev.target, iframe);
    if (!mesEl) {
      this.lastTap = null;
      return;
    }
    if (shouldIgnoreTarget(ev.target, ownerDoc)) {
      this.lastTap = null;
      return;
    }

    const now = Date.now();
    const { x, y } = this._translateCoords(t.clientX, t.clientY, iframe);

    if (
      this.lastTap &&
      this.lastTap.mesEl === mesEl &&
      now - this.lastTap.time < DOUBLE_TAP_MAX_DELAY_MS &&
      Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < DOUBLE_TAP_MAX_DIST_PX
    ) {
      this._fire(mesEl, x, y, ev);
      return;
    }

    this.lastTap = { time: now, x, y, mesEl };
  }
}
