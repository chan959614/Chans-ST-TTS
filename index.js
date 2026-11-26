/**
 * ST Direct TTS — Main Entry Point (Pure Native ES Module)
 * Loaded directly by SillyTavern / TauriTavern via manifest.json.
 * Zero bundler, zero Node.js dependencies, zero fragile relative core imports.
 */

import { DirectAudioPlayer } from './lib/audioPlayer.js';
import { MODULE_NAME } from './lib/constants.js';
import { MessageGestureHandler } from './lib/gestureHandler.js';
import { fetchLatestAiMessage, resolveMessageText } from './lib/messageSource.js';
import { runRegexAgentTurn } from './lib/regexAgent.js';
import { runRegexPipeline, splitIntoSentences } from './lib/regexEngine.js';
import { getEffectiveLlmAuth, getSettings, getSTContext } from './lib/storage.js';
import { AudioCache } from './lib/ttsClient.js';
import { FloatingContextMenu, MiniPlayerBar, SettingsPanelUI } from './lib/ui.js';

/**
 * Initialize and mount the ST Direct TTS extension.
 * Safe to call once in SillyTavern/TauriTavern or explicitly in a local sandbox host.
 * @param {{ settingsHost?: HTMLElement | null, chatRootSelector?: string, onSnapshot?: ((snap: any) => void) | null }} [options]
 */
export function initDirectTts({ settingsHost = null, chatRootSelector = '#chat', onSnapshot = null } = {}) {
  if (typeof window !== 'undefined' && window.__ST_DIRECT_TTS_INSTANCE__) {
    window.__ST_DIRECT_TTS_INSTANCE__.destroy();
  }

  const settings = getSettings();
  const cache = new AudioCache(120);

  let miniPlayer = null;
  let settingsUI = null;

  const player = new DirectAudioPlayer({
    cache,
    onStateChange: (state) => {
      miniPlayer?.render(state, settings.ui.showMiniPlayer !== false);
      settingsUI?.refreshCacheStats();
    },
  });

  miniPlayer = new MiniPlayerBar({
    onTogglePause: () => player.togglePause(),
    onResumeBlocked: () => player.resumeBlocked(),
    onStop: () => player.stop(),
  });

  /**
   * Core read flow triggered synchronously by menu click ("朗讀" or "重製朗讀").
   * Never sends message body to any LLM; runs regex pipeline locally and calls TTS directly.
   */
  const executeReadForMessage = (mesElement, { forceRegenerate = false } = {}) => {
    // 1. CRITICAL for Android WebView / TauriTavern: unlock singleton <audio> synchronously
    player.unlockAudioSync();

    // 2. Stop any existing playback & abort pending fetches immediately
    player.stop({ silentState: true });

    // 3. Async resolve Raw text -> run enabled regex rules -> play whole or sentence queue
    (async () => {
      const msg = await resolveMessageText({ mesElement });
      const pipelineResult = runRegexPipeline(msg.text, settings.regexRules);
      const isSentenceMode = settings.tts.playbackMode !== 'whole';
      const chunks = pipelineResult.speakable
        ? isSentenceMode
          ? splitIntoSentences(pipelineResult.cleanedText, settings.tts.maxSentenceChars)
          : [pipelineResult.cleanedText]
        : [];

      const snapshot = {
        timestamp: new Date().toLocaleTimeString(),
        actionLabel: forceRegenerate ? '重製朗讀' : '朗讀',
        mesId: msg.mesId,
        sourceType: msg.sourceType,
        sourceLabel: msg.sourceLabel,
        speakerName: msg.speakerName,
        pipelineResult,
        chunks: isSentenceMode ? chunks : null,
      };
      settingsUI?.setLastSnapshot(snapshot);
      onSnapshot?.(snapshot);

      if (!pipelineResult.speakable || chunks.length === 0) {
        miniPlayer.render(
          {
            status: 'error',
            speakerName: msg.speakerName || '朗讀中止',
            mode: settings.tts.playbackMode,
            currentIndex: 0,
            totalChunks: 0,
            currentText: '',
            errorMessage: '正則清洗後無可朗讀內容，請在「正則與對比」查看最近一次朗讀快照。',
          },
          true,
        );
        return;
      }

      const messageKey = `${msg.chatId}::mes_${msg.mesId ?? 'dom'}`;
      await player.playChunks({
        chunks,
        messageKey,
        speakerName: msg.speakerName,
        ttsConfig: settings.tts,
        forceRegenerate,
      });
    })().catch((err) => {
      miniPlayer.render(
        {
          status: 'error',
          speakerName: '朗讀錯誤',
          mode: settings.tts.playbackMode,
          currentIndex: 0,
          totalChunks: 0,
          currentText: '',
          errorMessage: err?.message || '執行朗讀時發生錯誤',
        },
        true,
      );
    });
  };

  const contextMenu = new FloatingContextMenu({
    onRead: (mesEl) => executeReadForMessage(mesEl, { forceRegenerate: false }),
    onReread: (mesEl) => executeReadForMessage(mesEl, { forceRegenerate: true }),
  });

  const gestureHandler = new MessageGestureHandler({
    rootSelector: chatRootSelector,
    isEnabled: () => settings.enabled !== false,
    onTrigger: ({ mesElement, x, y }) => {
      contextMenu.open({ x, y, mesElement });
    },
  });

  settingsUI = new SettingsPanelUI({
    settings,
    cache,
    onSettingsChanged: () => {
      // Keep audio player and UI synchronized
    },
    onTestTts: async () => {
      player.unlockAudioSync();
      const sampleText = '你好，這是 ST Direct TTS 語音連線試聽。';
      const t0 = performance.now();
      await player.playChunks({
        chunks: [sampleText],
        messageKey: '__tts_connection_test__',
        speakerName: '連線試聽',
        ttsConfig: { ...settings.tts, playbackMode: 'whole' },
        forceRegenerate: true,
      });
      if (player.state.status === 'error') {
        throw new Error(player.state.errorMessage || '試聽失敗');
      }
      return `試聽請求完成（耗時 ${((performance.now() - t0) / 1000).toFixed(2)} 秒）`;
    },
    onFetchLatestRaw: () => fetchLatestAiMessage(),
    onRunAgent: async ({ userPrompt, onProgress }) => {
      const latest = await fetchLatestAiMessage();
      if (!latest.text) {
        throw new Error('找不到可分析的聊天原文，請先開啟含對話的聊天室。');
      }
      const auth = getEffectiveLlmAuth(settings);
      const res = await runRegexAgentTurn({
        auth,
        rawText: latest.text,
        sourceLabel: latest.sourceLabel,
        userPrompt,
        currentRules: settings.regexRules,
        maxAutoRetries: settings.llm.maxAutoRetries ?? 2,
        onProgress,
      });
      return { ...res, sourceLabel: latest.sourceLabel };
    },
    onClearCache: () => {
      cache.clearAll();
    },
    onAfterReset: () => {
      player.stop();
      cache.clearAll();
    },
  });

  gestureHandler.attach();
  settingsUI.mount(settingsHost);

  // Hook into SillyTavern events if available (stop playback on chat switch, rescan iframes on new message)
  const ctx = getSTContext();
  const onChatChanged = () => {
    player.stop();
    contextMenu.close();
    gestureHandler.scanIframes();
  };
  const onMessageRendered = () => {
    gestureHandler.scanIframes();
  };

  if (ctx?.eventSource && ctx?.event_types) {
    if (ctx.event_types.CHAT_CHANGED) {
      ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, onChatChanged);
    }
    if (ctx.event_types.CHARACTER_MESSAGE_RENDERED) {
      ctx.eventSource.on(ctx.event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    }
  }

  const instance = {
    moduleName: MODULE_NAME,
    settings,
    cache,
    player,
    contextMenu,
    gestureHandler,
    settingsUI,
    readMessage: executeReadForMessage,
    destroy() {
      player.stop();
      cache.clearAll();
      contextMenu.close();
      gestureHandler.detach();
      miniPlayer?.destroy();
      if (ctx?.eventSource && ctx?.event_types) {
        try {
          ctx.eventSource.removeListener?.(ctx.event_types.CHAT_CHANGED, onChatChanged);
          ctx.eventSource.removeListener?.(ctx.event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
        } catch {
          // Ignore listener cleanup errors
        }
      }
    },
  };

  if (typeof window !== 'undefined') {
    window.__ST_DIRECT_TTS_INSTANCE__ = instance;
  }
  return instance;
}

if (typeof window !== 'undefined') {
  window.__ST_DIRECT_TTS_INIT__ = initDirectTts;
  window.dispatchEvent(new CustomEvent('st-direct-tts-module-loaded'));
}

// Auto-boot inside real SillyTavern / TauriTavern environments
if (typeof window !== 'undefined' && !window.__ST_DIRECT_TTS_MANUAL_BOOT__) {
  const boot = () => {
    const hasHost =
      document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (hasHost) {
      initDirectTts();
    } else if (typeof window.jQuery === 'function') {
      window.jQuery(() => initDirectTts());
    } else {
      window.addEventListener('DOMContentLoaded', () => initDirectTts(), { once: true });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
