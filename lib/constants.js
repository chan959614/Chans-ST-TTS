/**
 * ST Direct TTS — Constants, default settings, multi-profile factories & curated regex presets.
 * Pure ES Module (no bundler required).
 */

export const MODULE_NAME = 'st_direct_tts';
export const EXTENSION_VERSION = '1.1.0';

/**
 * Common OpenAI & Edge TTS Worker voices for offline fallback before /v1/voices loads.
 */
export const FALLBACK_VOICES = [
  { id: 'zh-TW-HsiaoChenNeural', label: 'zh-TW-HsiaoChenNeural (臺灣女聲・曉臻)', locale: 'zh-TW' },
  { id: 'zh-TW-YunJheNeural', label: 'zh-TW-YunJheNeural (臺灣男聲・雲哲)', locale: 'zh-TW' },
  { id: 'zh-TW-HsiaoYuNeural', label: 'zh-TW-HsiaoYuNeural (臺灣女聲・曉雨)', locale: 'zh-TW' },
  { id: 'zh-CN-XiaoxiaoNeural', label: 'zh-CN-XiaoxiaoNeural (普通話女聲・曉曉)', locale: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural', label: 'zh-CN-YunxiNeural (普通話男聲・雲希)', locale: 'zh-CN' },
  { id: 'zh-CN-YunjianNeural', label: 'zh-CN-YunjianNeural (普通話男聲・雲健)', locale: 'zh-CN' },
  { id: 'zh-HK-HiuMaanNeural', label: 'zh-HK-HiuMaanNeural (粵語女聲・曉曼)', locale: 'zh-HK' },
  { id: 'ja-JP-NanamiNeural', label: 'ja-JP-NanamiNeural (日語女聲・七海)', locale: 'ja-JP' },
  { id: 'en-US-AvaMultilingualNeural', label: 'en-US-AvaMultilingualNeural (多語女聲・Ava)', locale: 'en-US' },
  { id: 'alloy', label: 'alloy (OpenAI 別名)', locale: 'alias' },
  { id: 'nova', label: 'nova (OpenAI 別名)', locale: 'alias' },
  { id: 'onyx', label: 'onyx (OpenAI 別名)', locale: 'alias' },
  { id: 'echo', label: 'echo (OpenAI 別名)', locale: 'alias' },
  { id: 'shimmer', label: 'shimmer (OpenAI 別名)', locale: 'alias' },
  { id: 'fable', label: 'fable (OpenAI 別名)', locale: 'alias' },
];

export const DEFAULT_MODELS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'edge-tts'];

export const RESPONSE_FORMATS = [
  { value: 'mp3', label: 'mp3（最相容，支援長文串流）' },
  { value: 'opus', label: 'opus（WebM，Edge Worker 僅限單段 ≤4KB）' },
];

/**
 * Curated one-click regex templates so users don't have to memorize syntax.
 */
export const REGEX_PRESETS = [
  {
    id: 'strip_think',
    name: '移除 <think> / <thinking> 思考過程',
    findRegex: '/<think(?:ing)?>[\\s\\S]*?<\\/think(?:ing)?>/gi',
    replaceString: '',
  },
  {
    id: 'extract_content',
    name: '正向框選 <content> 正文',
    findRegex: '/[\\s\\S]*?<content>([\\s\\S]*?)<\\/content>[\\s\\S]*/gi',
    replaceString: '$1',
  },
  {
    id: 'strip_status',
    name: '移除 <status> / <details> 狀態欄',
    findRegex: '/<(?:status|details|summary|hud|meta)[\\s\\S]*?<\\/(?:status|details|summary|hud|meta)>/gi',
    replaceString: '',
  },
  {
    id: 'strip_html_comment',
    name: '移除 HTML 註解 <!-- ... -->',
    findRegex: '/<!--[\\s\\S]*?-->/g',
    replaceString: '',
  },
  {
    id: 'strip_code_fence',
    name: '移除程式碼／JSON 狀態區塊 ```...```',
    findRegex: '/```[\\s\\S]*?```/g',
    replaceString: '',
  },
  {
    id: 'strip_html_tags',
    name: '移除成對 <style>/<script> 與殘留 HTML 標籤',
    findRegex: '/<(?:style|script)[^>]*>[\\s\\S]*?<\\/(?:style|script)>|<[^>]+>/gi',
    replaceString: '',
  },
];

export function createDefaultRules() {
  return [
    {
      id: 'rule_default_think',
      name: '移除思考標籤 <think> / <thinking>',
      findRegex: '/<think(?:ing)?>[\\s\\S]*?<\\/think(?:ing)?>/gi',
      replaceString: '',
      enabled: true,
    },
    {
      id: 'rule_default_comment',
      name: '移除 HTML 註解',
      findRegex: '/<!--[\\s\\S]*?-->/g',
      replaceString: '',
      enabled: true,
    },
  ];
}

export function createTtsProfile(overrides = {}) {
  return {
    id: overrides.id || `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name || '預設 TTS 方案',
    baseUrl: overrides.baseUrl ?? '',
    apiKey: overrides.apiKey ?? '',
    model: overrides.model || 'tts-1',
    voice: overrides.voice || 'zh-TW-HsiaoChenNeural',
    responseFormat: overrides.responseFormat || 'mp3',
    speed: typeof overrides.speed === 'number' ? overrides.speed : 1.0,
    pitch: typeof overrides.pitch === 'number' ? overrides.pitch : 0,
    volume: typeof overrides.volume === 'number' ? overrides.volume : 100,
    sendExtendedParams: Boolean(overrides.sendExtendedParams),
  };
}

export function createLlmProfile(overrides = {}) {
  return {
    id: overrides.id || `llm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name || '預設 LLM 方案',
    baseUrl: overrides.baseUrl ?? '',
    apiKey: overrides.apiKey ?? '',
    model: overrides.model || 'gpt-4o-mini',
  };
}

export function createDefaultSettings() {
  const defaultTts = createTtsProfile({ id: 'tts_default', name: '預設 TTS 方案' });
  const defaultLlm = createLlmProfile({ id: 'llm_default', name: '預設 LLM 方案' });

  return {
    enabled: true,
    activeTtsProfileId: defaultTts.id,
    ttsProfiles: [defaultTts],
    tts: {
      baseUrl: defaultTts.baseUrl,
      apiKey: defaultTts.apiKey,
      model: defaultTts.model,
      voice: defaultTts.voice,
      responseFormat: defaultTts.responseFormat,
      speed: defaultTts.speed,
      pitch: defaultTts.pitch,
      volume: defaultTts.volume,
      sendExtendedParams: defaultTts.sendExtendedParams,
      /** 'whole' | 'sentence' */
      playbackMode: 'sentence',
      /** Max characters per chunk in sentence-queue mode */
      maxSentenceChars: 220,
      /** How many upcoming sentences to prefetch while playing current */
      prefetchCount: 2,
      /** Request timeout in ms */
      timeoutMs: 30000,
    },
    regexRules: createDefaultRules(),
    activeLlmProfileId: defaultLlm.id,
    llmProfiles: [defaultLlm],
    llm: {
      baseUrl: defaultLlm.baseUrl,
      apiKey: defaultLlm.apiKey,
      model: defaultLlm.model,
      maxAutoRetries: 2,
    },
    ui: {
      voiceLocaleFilter: 'zh',
      showMiniPlayer: true,
      orbPosition: {
        side: 'right',
        topRatio: 0.72,
      },
    },
  };
}
