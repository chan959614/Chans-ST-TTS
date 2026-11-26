import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Plus, Smartphone, Sun, Trash2 } from 'lucide-react';
import '../../style.css';
import { INITIAL_SANDBOX_CHAT, type SandboxChatMessage } from '../data/sandboxMessages';
import {
  installSandboxFetchInterceptor,
  MOCK_LLM_BASE_URL,
  MOCK_TTS_BASE_URL,
  type NetworkLogEntry,
} from '../utils/mockEndpoints';

interface ExtensionSandboxProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

declare global {
  interface Window {
    __ST_DIRECT_TTS_MANUAL_BOOT__?: boolean;
    __ST_DIRECT_TTS_INSTANCE__?: {
      destroy: () => void;
      gestureHandler: { scanIframes: () => void };
      settings: {
        tts: { baseUrl: string; apiKey: string };
        llm: { baseUrl: string; apiKey: string };
      };
      settingsUI: { render: () => void };
    };
    SillyTavern?: {
      getContext: () => {
        chat: SandboxChatMessage[];
        chatId: string;
        extensionSettings: Record<string, unknown>;
        saveSettingsDebounced: () => void;
        eventSource: {
          on: (event: string, fn: () => void) => void;
          removeListener: (event: string, fn: () => void) => void;
          emit: (event: string) => void;
        };
        event_types: {
          CHAT_CHANGED: string;
          CHARACTER_MESSAGE_RENDERED: string;
        };
      };
    };
  }
}

const STORAGE_KEY = 'st_sandbox_extension_settings_v1';

export function ExtensionSandbox({ isDark, onToggleTheme }: ExtensionSandboxProps) {
  const [messages, setMessages] = useState<SandboxChatMessage[]>(INITIAL_SANDBOX_CHAT);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>([]);
  const [bootError, setBootError] = useState<string>('');
  const [saveTick, setSaveTick] = useState<string>('');
  const [newRawText, setNewRawText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const settingsHostRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<SandboxChatMessage[]>(messages);
  messagesRef.current = messages;

  // Mount real root /index.js + /style.css inside simulated SillyTavern context
  useEffect(() => {
    let cancelled = false;
    window.__ST_DIRECT_TTS_MANUAL_BOOT__ = true;

    // 1. Install local mock fetch interceptor (only intercepts mock-edge-tts.local & mock-llm.local)
    const uninstallFetch = installSandboxFetchInterceptor((entry) => {
      setNetworkLogs((prev) => [entry, ...prev].slice(0, 12));
    });

    // 2. Create authentic SillyTavern.getContext() runtime shim
    let storedSettings: Record<string, unknown> = {};
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) storedSettings = JSON.parse(saved);
    } catch {
      storedSettings = {};
    }

    const listeners = new Map<string, Set<() => void>>();
    const eventSource = {
      on(event: string, fn: () => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
      },
      removeListener(event: string, fn: () => void) {
        listeners.get(event)?.delete(fn);
      },
      emit(event: string) {
        listeners.get(event)?.forEach((fn) => fn());
      },
    };

    let saveTimer: number | undefined;
    window.SillyTavern = {
      getContext: () => ({
        chat: messagesRef.current,
        chatId: 'sandbox_chat_rainy_station',
        extensionSettings: storedSettings,
        saveSettingsDebounced: () => {
          window.clearTimeout(saveTimer);
          saveTimer = window.setTimeout(() => {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(storedSettings));
              setSaveTick(new Date().toLocaleTimeString());
            } catch {
              // Ignore quota errors
            }
          }, 120);
        },
        eventSource,
        event_types: {
          CHAT_CHANGED: 'chat_id_changed',
          CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
        },
      }),
    };

    // 3. Import the REAL root ES module /index.js directly
    import('../../index.js')
      .then((mod) => {
        if (cancelled || !settingsHostRef.current) return;
        const instance = mod.initDirectTts({
          settingsHost: settingsHostRef.current,
          chatRootSelector: '#chat',
        });

        // Pre-fill sandbox mock URLs ONLY on first load when URLs are empty so users can test immediately
        if (!instance.settings.tts.baseUrl) {
          instance.settings.tts.baseUrl = MOCK_TTS_BASE_URL;
          instance.settings.llm.baseUrl = MOCK_LLM_BASE_URL;
          instance.settingsUI.render();
        }
      })
      .catch((err) => {
        if (!cancelled) setBootError(`載入根目錄 /index.js 失敗：${err?.message || String(err)}`);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(saveTimer);
      uninstallFetch();
      window.__ST_DIRECT_TTS_INSTANCE__?.destroy();
    };
  }, []);

  // Re-scan embedded iframes when chat message list changes
  useEffect(() => {
    window.__ST_DIRECT_TTS_INSTANCE__?.gestureHandler?.scanIframes();
  }, [messages]);

  const handleAppendMessage = () => {
    const trimmed = newRawText.trim();
    if (!trimmed) return;
    const nextId = messages.length;
    const displayText = trimmed
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    const nextMsg: SandboxChatMessage = {
      mesid: nextId,
      name: '林知夏',
      is_user: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mes: trimmed,
      renderedParagraphs: (displayText || trimmed).split(/\n+/).filter(Boolean),
    };
    setMessages((prev) => [...prev, nextMsg]);
    setNewRawText('');
    setShowAddForm(false);
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-5 sm:px-6">
      {/* Compact Workspace Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-900 dark:text-slate-100">即時沙盒</span>
          <span aria-hidden="true">·</span>
          <span>直接運行根目錄 /index.js 與 /manifest.json 原生模組</span>
          <span aria-hidden="true">·</span>
          <span>雙擊左側任一樓層文字、留白處或內嵌 iframe 彈出朗讀選單</span>
          {saveTick && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">已儲存 {saveTick}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobilePreview(false)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                !mobilePreview
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              桌面版
            </button>
            <button
              type="button"
              onClick={() => setMobilePreview(true)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                mobilePreview
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              安卓 390px
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={isDark ? '切換至亮色主題' : '切換至暗色主題'}
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {isDark ? '亮色主題' : '暗色主題'}
          </button>
        </div>
      </div>

      {bootError && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {bootError}
        </div>
      )}

      {/* Main Split Grid: Left = Simulated SillyTavern #chat | Right = Real #extensions_settings2 */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left: Simulated SillyTavern / TauriTavern Chat Area */}
        <section className="lg:col-span-7">
          <div
            className={`mx-auto rounded-xl border border-slate-200 bg-[var(--SmartThemeChatTintColor)] transition-all dark:border-slate-800 ${
              mobilePreview ? 'max-w-[390px]' : 'w-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-[var(--SmartThemeBorderColor)] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--SmartThemeEmColor)]">
                <span className="font-semibold text-[var(--SmartThemeBodyColor)]">模擬聊天視窗 (#chat)</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{messages.length} 樓</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--SmartThemeBorderColor)] px-2.5 py-1 text-xs font-medium text-[var(--SmartThemeBodyColor)] hover:bg-black/5 whitespace-nowrap dark:hover:bg-white/5"
              >
                <Plus className="h-3.5 w-3.5" />
                新增測試樓層
              </button>
            </div>

            {showAddForm && (
              <div className="border-b border-[var(--SmartThemeBorderColor)] bg-[var(--SmartThemeBlurTintColor)] p-4">
                <label className="mb-1.5 block text-xs font-medium text-[var(--SmartThemeEmColor)]" htmlFor="new-raw-msg">
                  輸入 Raw 原文（可含 &lt;think&gt;、&lt;content&gt;、&lt;status&gt; 或 HTML 註解）
                </label>
                <textarea
                  id="new-raw-msg"
                  value={newRawText}
                  onChange={(e) => setNewRawText(e.target.value)}
                  rows={4}
                  placeholder="<think>內心思考</think>\n這是一段會被朗讀的正文。"
                  className="w-full rounded-lg border border-[var(--SmartThemeBorderColor)] bg-[var(--SmartThemeChatTintColor)] p-2.5 font-mono text-xs text-[var(--SmartThemeBodyColor)] focus:border-blue-500 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-md border border-[var(--SmartThemeBorderColor)] px-3 py-1.5 text-xs font-medium text-[var(--SmartThemeBodyColor)]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAppendMessage}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                  >
                    加入至聊天室
                  </button>
                </div>
              </div>
            )}

            {/* Authentic SillyTavern #chat DOM structure (.mes[mesid], .mes_text, .mes_buttons) */}
            <div id="chat" className="divide-y divide-[var(--SmartThemeBorderColor)]">
              {messages.map((m) => (
                <article
                  key={m.mesid}
                  className="mes relative cursor-pointer px-4 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  data-testid={`mes-floor-${m.mesid}`}
                  {...{ mesid: String(m.mesid), is_user: String(m.is_user) }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--SmartThemeEmColor)]">
                      <span className="name_text font-semibold text-[var(--SmartThemeBodyColor)]">{m.name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">#{m.mesid} 樓</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{m.timestamp}</span>
                    </div>

                    {/* Simulated .mes_buttons area — double-clicking here MUST be ignored */}
                    <div className="mes_buttons flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="mes_button rounded border border-[var(--SmartThemeBorderColor)] px-2 py-0.5 text-[11px] text-[var(--SmartThemeEmColor)] hover:text-[var(--SmartThemeBodyColor)]"
                        title="測試防誤觸：雙擊此操作按鈕不會彈出選單"
                      >
                        操作鈕
                      </button>
                    </div>
                  </div>

                  {m.reasoningPreview && (
                    <details className="mes_reasoning mb-2 rounded-md border border-[var(--SmartThemeBorderColor)] bg-[var(--SmartThemeBlurTintColor)] px-3 py-1.5 text-xs text-[var(--SmartThemeEmColor)]">
                      <summary className="mes_reasoning_header cursor-pointer select-none">
                        思考過程（前端已折疊，但 Raw 原文包含 &lt;think&gt; 標籤）
                      </summary>
                      <p className="mt-1.5 font-mono text-[11px]">{m.reasoningPreview}</p>
                    </details>
                  )}

                  <div className="mes_text space-y-2.5 text-[14px] leading-relaxed text-[var(--SmartThemeBodyColor)]">
                    {m.renderedParagraphs.map((p, idx) => (
                      <p key={idx}>{p}</p>
                    ))}

                    {m.iframeHtml && (
                      <iframe
                        title={`第 ${m.mesid} 樓內嵌同源狀態卡片`}
                        srcDoc={m.iframeHtml}
                        className="mt-3 h-[74px] w-full rounded-lg border border-[var(--SmartThemeBorderColor)]"
                      />
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Live Mock Worker / LLM Request Log (quiet, unobtrusive) */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#141923]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                模擬端點請求紀錄（填寫真實 Worker / LLM URL 時將直連外部服務）
              </h2>
              {networkLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setNetworkLogs([])}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Trash2 className="h-3 w-3" />
                  清空
                </button>
              )}
            </div>
            {networkLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                尚未送出模擬請求。雙擊上方任一訊息並點選「朗讀」，或在右側按下「載入伺服器音色 / 測試連線」。
              </p>
            ) : (
              <div className="divide-y divide-slate-100 font-mono text-xs dark:divide-slate-800/80">
                {networkLogs.map((log) => (
                  <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 tabular-nums">{log.time}</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{log.method}</span>
                      <span className="text-slate-800 dark:text-slate-200">{log.url}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <span>{log.detail}</span>
                      <span className={log.status >= 400 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}>
                        HTTP {log.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: Real SillyTavern #extensions_settings2 Container */}
        <aside className="st-sandbox-drawer lg:col-span-5">
          <div id="extensions_settings2" ref={settingsHostRef} />
        </aside>
      </div>
    </div>
  );
}
