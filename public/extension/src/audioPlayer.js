/**
 * ST Direct TTS — Android WebView / TauriTavern Resilient Audio Player & Queue Engine.
 *
 * Key stability guarantees:
 * 1. Singleton HTMLAudioElement kept in memory (never placed inside collapsible drawers).
 * 2. Synchronous gesture unlock inside click handler via tiny silent WAV data URI
 *    so Android WebView does not reject async post-fetch play() with NotAllowedError.
 * 3. Graceful NotAllowedError recovery: exposes 'blocked' state with resume() action.
 * 4. Supports both Whole-Message mode and Sentence-Queue Prefetch (N+1, N+2) mode.
 */

import { buildCacheKey, synthesizeSpeech } from './ttsClient.js';

// 1-sample silent PCM WAV data URI for reliable synchronous WebView audio unlock
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export class DirectAudioPlayer {
  constructor({ cache, onStateChange }) {
    this.cache = cache;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};

    /** Singleton HTMLAudioElement — never mounted inside collapsible ST drawers */
    this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
    if (this.audio) {
      this.audio.preload = 'auto';
      this.audio.playsInline = true;
    }

    this.sessionId = 0;
    this.abortController = null;
    this.prefetchPromises = new Map();
    this.state = {
      status: 'idle', // 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error'
      messageKey: '',
      speakerName: '',
      mode: 'sentence',
      currentIndex: 0,
      totalChunks: 0,
      cacheHit: false,
      currentText: '',
      errorMessage: '',
    };

    this._pendingResolveEnd = null;
    this._bindAudioEvents();
  }

  _bindAudioEvents() {
    if (!this.audio) return;

    this.audio.addEventListener('ended', () => {
      if (this._pendingResolveEnd) {
        const fn = this._pendingResolveEnd;
        this._pendingResolveEnd = null;
        fn('ended');
      }
    });

    this.audio.addEventListener('error', () => {
      if (this._pendingResolveEnd) {
        const fn = this._pendingResolveEnd;
        this._pendingResolveEnd = null;
        fn('error');
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.state.status === 'playing' && !this.audio.ended) {
        this._updateState({ status: 'paused' });
      }
    });

    this.audio.addEventListener('play', () => {
      if (this.state.status === 'paused' || this.state.status === 'blocked') {
        this._updateState({ status: 'playing', errorMessage: '' });
      }
    });
  }

  _updateState(patch) {
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  /**
   * MUST be called synchronously inside the user's click/tap event handler
   * BEFORE any `await` or network fetch, to unlock Android WebView autoplay policy.
   */
  unlockAudioSync() {
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.audio.src = SILENT_WAV_DATA_URI;
      this.audio.muted = true;
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            this.audio.pause();
            this.audio.muted = false;
          })
          .catch(() => {
            this.audio.muted = false;
          });
      } else {
        this.audio.muted = false;
      }
    } catch {
      this.audio.muted = false;
    }
  }

  /**
   * Stop any active playback and abort all in-flight TTS requests.
   */
  stop({ silentState = false } = {}) {
    this.sessionId++;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.prefetchPromises.clear();

    if (this._pendingResolveEnd) {
      const fn = this._pendingResolveEnd;
      this._pendingResolveEnd = null;
      fn('aborted');
    }

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // Ignore audio reset quirks
      }
    }

    if (!silentState) {
      this._updateState({
        status: 'idle',
        currentIndex: 0,
        totalChunks: 0,
        currentText: '',
        errorMessage: '',
        cacheHit: false,
      });
    }
  }

  togglePause() {
    if (!this.audio) return;
    if (this.state.status === 'playing') {
      this.audio.pause();
      this._updateState({ status: 'paused' });
    } else if (this.state.status === 'paused' || this.state.status === 'blocked') {
      this.resumeBlocked();
    }
  }

  async resumeBlocked() {
    if (!this.audio) return;
    try {
      this.audio.muted = false;
      await this.audio.play();
      this._updateState({ status: 'playing', errorMessage: '' });
    } catch (err) {
      this._updateState({
        status: 'blocked',
        errorMessage: `系統仍限制自動播放：${err.message}`,
      });
    }
  }

  /**
   * Play a list of ordered chunks (1 chunk for 'whole' mode, N chunks for 'sentence' mode).
   */
  async playChunks({ chunks, messageKey, speakerName, ttsConfig, forceRegenerate = false }) {
    this.stop({ silentState: true });
    const mySession = this.sessionId;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    if (forceRegenerate && messageKey) {
      this.cache.evictMessage(messageKey);
    }

    const mode = ttsConfig.playbackMode === 'whole' ? 'whole' : 'sentence';
    const prefetchAhead = mode === 'sentence' ? Math.max(0, Math.min(3, Number(ttsConfig.prefetchCount) || 2)) : 0;

    this._updateState({
      status: 'loading',
      messageKey,
      speakerName: speakerName || '朗讀中',
      mode,
      currentIndex: 0,
      totalChunks: chunks.length,
      cacheHit: false,
      currentText: chunks[0] || '',
      errorMessage: '',
    });

    const getChunkAudioUrl = (index) => {
      const text = chunks[index];
      const cacheKey = buildCacheKey({
        messageKey,
        text,
        ttsConfig,
        chunkIndex: mode === 'whole' ? -1 : index,
      });

      const cachedUrl = this.cache.get(cacheKey);
      if (cachedUrl) {
        return Promise.resolve({ url: cachedUrl, cacheHit: true });
      }

      if (this.prefetchPromises.has(cacheKey)) {
        return this.prefetchPromises.get(cacheKey);
      }

      const promise = synthesizeSpeech({ text, ttsConfig, signal })
        .then(({ blob }) => {
          const url = this.cache.set(cacheKey, blob, messageKey);
          return { url, cacheHit: false };
        })
        .finally(() => {
          this.prefetchPromises.delete(cacheKey);
        });

      this.prefetchPromises.set(cacheKey, promise);
      return promise;
    };

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (mySession !== this.sessionId || signal.aborted) return;

        this._updateState({
          status: 'loading',
          currentIndex: i + 1,
          currentText: chunks[i],
          errorMessage: '',
        });

        // Kick off prefetch for upcoming 1..prefetchAhead sentences in background
        for (let ahead = 1; ahead <= prefetchAhead; ahead++) {
          if (i + ahead < chunks.length) {
            getChunkAudioUrl(i + ahead).catch(() => {
              // Error will be surfaced when playback reaches that chunk
            });
          }
        }

        const { url, cacheHit } = await getChunkAudioUrl(i);
        if (mySession !== this.sessionId || signal.aborted) return;

        this._updateState({
          status: 'playing',
          currentIndex: i + 1,
          cacheHit,
          currentText: chunks[i],
        });

        const outcome = await this._playSingleUrl(url, mySession);
        if (mySession !== this.sessionId || signal.aborted || outcome === 'aborted') {
          return;
        }
        if (outcome === 'error') {
          throw new Error('瀏覽器無法解碼或播放此音訊格式，建議使用 mp3 格式');
        }
      }

      if (mySession === this.sessionId) {
        this._updateState({
          status: 'idle',
          currentIndex: 0,
          totalChunks: 0,
          currentText: '',
          errorMessage: '',
        });
      }
    } catch (err) {
      if (err?.name === 'AbortError' || mySession !== this.sessionId) return;
      this._updateState({
        status: 'error',
        errorMessage: err?.message || '朗讀過程發生未知錯誤',
      });
    }
  }

  async _playSingleUrl(url, mySession) {
    if (!this.audio) return 'ended';

    return new Promise((resolve) => {
      this._pendingResolveEnd = resolve;
      this.audio.muted = false;
      this.audio.src = url;

      const attemptPlay = async () => {
        try {
          await this.audio.play();
        } catch (err) {
          if (mySession !== this.sessionId) {
            resolve('aborted');
            return;
          }
          if (err?.name === 'NotAllowedError') {
            // Android WebView autoplay block: keep waiting until user taps "點擊繼續播放"
            this._updateState({
              status: 'blocked',
              errorMessage: '瀏覽器限制自動播放，請點擊下方按鈕繼續',
            });
          } else {
            resolve('error');
          }
        }
      };

      attemptPlay();
    });
  }
}
