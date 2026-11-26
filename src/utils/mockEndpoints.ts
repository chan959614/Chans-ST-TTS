/**
 * Local Sandbox Mock Interceptor for testing the real /extension/index.js in browser
 * without requiring an external API key.
 *
 * Only intercepts requests targeting `https://mock-edge-tts.local` or `https://mock-llm.local`.
 * Any real user-entered URL (e.g. Cloudflare Worker or OpenAI API) passes directly to real fetch().
 */

export const MOCK_TTS_BASE_URL = 'https://mock-edge-tts.local';
export const MOCK_LLM_BASE_URL = 'https://mock-llm.local';

const MOCK_VOICES = [
  { id: 'zh-TW-HsiaoChenNeural', locale: 'zh-TW', gender: 'Female', personalities: ['Friendly', 'Positive'] },
  { id: 'zh-TW-YunJheNeural', locale: 'zh-TW', gender: 'Male', personalities: ['Friendly', 'Positive'] },
  { id: 'zh-TW-HsiaoYuNeural', locale: 'zh-TW', gender: 'Female', personalities: ['Warm', 'Calm'] },
  { id: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female', personalities: ['Warm', 'Expressive'] },
  { id: 'zh-CN-YunxiNeural', locale: 'zh-CN', gender: 'Male', personalities: ['Lively', 'Sunshine'] },
  { id: 'zh-HK-HiuMaanNeural', locale: 'zh-HK', gender: 'Female', personalities: ['Friendly', 'Clear'] },
  { id: 'ja-JP-NanamiNeural', locale: 'ja-JP', gender: 'Female', personalities: ['Bright', 'Natural'] },
  { id: 'en-US-AvaMultilingualNeural', locale: 'en-US', gender: 'Female', personalities: ['Expressive', 'Caring'] },
];

/**
 * Generate a real valid PCM WAV Blob (short pleasant chime proportional to text length)
 * so native HTMLAudioElement actually decodes, plays, pauses, and fires 'ended' events!
 */
export function synthesizeDemoWavBlob(text: string, speed = 1.0): Blob {
  const sampleRate = 16000;
  const clampedSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1.0));
  const durationSec = Math.min(1.6, Math.max(0.45, (text.length * 0.025) / clampedSpeed));
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Soft mellow dual-tone envelope
  const baseFreq = 330 + (text.length % 7) * 28;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.04);
    const release = Math.min(1, (durationSec - t) / 0.12);
    const env = Math.max(0, Math.min(attack, release)) * 0.18;
    const sample = Math.sin(2 * Math.PI * baseFreq * t) * 0.65 + Math.sin(2 * Math.PI * baseFreq * 1.5 * t) * 0.35;
    view.setInt16(44 + i * 2, Math.round(sample * env * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export interface NetworkLogEntry {
  id: number;
  time: string;
  method: string;
  url: string;
  detail: string;
  status: number;
}

let logSeq = 1;

export function installSandboxFetchInterceptor(onLog: (entry: NetworkLogEntry) => void): () => void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept our explicit mock domains; real external URLs pass through untouched
    if (!urlStr.startsWith(MOCK_TTS_BASE_URL) && !urlStr.startsWith(MOCK_LLM_BASE_URL)) {
      return originalFetch(input, init);
    }

    const url = new URL(urlStr);
    const method = (init?.method || 'GET').toUpperCase();

    // Respect AbortSignal
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Small realistic network latency
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 140);
      init?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });

    // 1. Mock Edge TTS Worker: GET /v1/voices
    if (url.pathname.endsWith('/voices') && method === 'GET') {
      const locale = (url.searchParams.get('locale') || '').toLowerCase();
      const filtered = MOCK_VOICES.filter((v) => !locale || v.locale.toLowerCase().startsWith(locale));
      onLog({
        id: logSeq++,
        time: new Date().toLocaleTimeString(),
        method,
        url: url.pathname + url.search,
        detail: `回傳 ${filtered.length} 個模擬 Edge 音色`,
        status: 200,
      });
      return new Response(JSON.stringify({ object: 'list', data: filtered }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Mock Edge TTS Worker: POST /v1/audio/speech
    if (url.pathname.endsWith('/audio/speech') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const text = String(body.input || '');
      const fmt = String(body.response_format || 'mp3').toLowerCase();

      // Mirror worker.js single-chunk restriction on opus
      if ((fmt === 'opus' || fmt === 'webm') && new TextEncoder().encode(text).length > 4096) {
        onLog({
          id: logSeq++,
          time: new Date().toLocaleTimeString(),
          method,
          url: url.pathname,
          detail: '400 opus 超過單段 4KB 上限（與 worker.js 一致）',
          status: 400,
        });
        return new Response(
          JSON.stringify({
            error: { message: 'opus（WebM）只支援單段文字（約 1300 中文字內），長文請改用 mp3' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const wavBlob = synthesizeDemoWavBlob(text, body.speed);
      onLog({
        id: logSeq++,
        time: new Date().toLocaleTimeString(),
        method,
        url: url.pathname,
        detail: `voice=${body.voice} · ${text.length} 字 · ${fmt}`,
        status: 200,
      });
      return new Response(wavBlob, {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'X-Edge-TTS-Chunks': '1',
        },
      });
    }

    // 3. Mock OpenAI Chat Completions for AI Regex Agent
    if (url.pathname.endsWith('/chat/completions') && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const userContent = messages.find((m: { role: string }) => m.role === 'user')?.content || '';

      const hasContentTag = /<content>[\s\S]*?<\/content>/i.test(userContent);
      const hasThinkTag = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/i.test(userContent);
      const rules = hasContentTag
        ? [
            ...(hasThinkTag
              ? [
                  {
                    name: '先移除 <think>/<thinking> 避免誤配標籤',
                    findRegex: '/<think(?:ing)?>[\\s\\S]*?<\\/think(?:ing)?>/gi',
                    replaceString: '',
                    enabled: true,
                  },
                ]
              : []),
            {
              name: '正向框選 <content> 正文',
              findRegex: '/[\\s\\S]*?<content>([\\s\\S]*?)<\\/content>[\\s\\S]*/gi',
              replaceString: '$1',
              enabled: true,
            },
            {
              name: '移除正文內殘留 HTML 註解',
              findRegex: '/<!--[\\s\\S]*?-->/g',
              replaceString: '',
              enabled: true,
            },
          ]
        : [
            {
              name: '移除 <think>/<thinking> 思考區塊',
              findRegex: '/<think(?:ing)?>[\\s\\S]*?<\\/think(?:ing)?>/gi',
              replaceString: '',
              enabled: true,
            },
            {
              name: '移除 <status> 狀態欄區塊',
              findRegex: '/<status>[\\s\\S]*?<\\/status>/gi',
              replaceString: '',
              enabled: true,
            },
            {
              name: '移除 HTML 註解',
              findRegex: '/<!--[\\s\\S]*?-->/g',
              replaceString: '',
              enabled: true,
            },
          ];

      const analysis = hasContentTag
        ? '偵測到原文以 <content>...</content> 完整包裹正文，優先採用正向框選抽出 $1，並清除 HTML 註解，不更動任何換行與標點。'
        : '未發現統一正文外框標籤，改以最小化規則移除 <think>/<thinking>、<status> 與 HTML 註解，完整保留正文標點與段落停頓。';

      const replyText = `${analysis}\n\n\`\`\`json\n${JSON.stringify({ analysis, rules }, null, 2)}\n\`\`\``;

      onLog({
        id: logSeq++,
        time: new Date().toLocaleTimeString(),
        method,
        url: url.pathname,
        detail: `AI 正則助手產出 ${rules.length} 條規則`,
        status: 200,
      });

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: replyText }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ error: { message: `Unknown mock path: ${url.pathname}` } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return () => {
    window.fetch = originalFetch;
  };
}
