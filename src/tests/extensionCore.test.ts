import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeRegexSafety,
  hasSpeakableContent,
  parseRulePattern,
  runRegexPipeline,
  splitIntoSentences,
} from '../../lib/regexEngine.js';
import {
  buildCacheKey,
  resolveChatEndpoint,
  resolveTtsEndpoints,
} from '../../lib/ttsClient.js';
import { createDefaultSettings } from '../../lib/constants.js';
import {
  addLlmProfile,
  addTtsProfile,
  deleteTtsProfile,
  getEffectiveLlmAuth,
  renameLlmProfile,
  resetAll,
  resetKeepCredentials,
  selectLlmProfile,
  selectTtsProfile,
  syncActiveLlmProfile,
  syncActiveTtsProfile,
} from '../../lib/storage.js';
import {
  extractRulesFromLlmReply,
  inspectSandboxResult,
} from '../../lib/regexAgent.js';
import { buildZipArchive } from '../utils/zipBuilder';

test('regexEngine: parses /pattern/flags and forces g flag', () => {
  const parsed = parseRulePattern('/<think>[\\s\\S]*?<\\/think>/i');
  assert.equal(parsed.kind, 'regex');
  assert.equal(parsed.flags?.includes('g'), true);
  assert.equal(parsed.flags?.includes('i'), true);
});

test('regexEngine: blocks ReDoS nested quantifier patterns safely', () => {
  const danger1 = analyzeRegexSafety('(a+)+$');
  assert.equal(danger1.safe, false);
  const danger2 = analyzeRegexSafety('(.*)*foo');
  assert.equal(danger2.safe, false);

  const safePattern = analyzeRegexSafety('<think>[\\s\\S]*?<\\/think>');
  assert.equal(safePattern.safe, true);

  const res = runRegexPipeline('aaaaab', [
    { id: 'bad', name: 'Bad ReDoS', findRegex: '/(a+)+$/g', replaceString: '', enabled: true },
  ]);
  assert.equal(res.cleanedText, 'aaaaab');
  assert.equal(res.steps[0].skipped, true);
  assert.ok(res.warnings.length > 0);
});

test('regexEngine: positive extraction preserves newlines and punctuation without altering body', () => {
  const raw = `<think>內心獨白</think>
<content>第一段，保留逗號。

「第二段！」</content>
<status>HP: 100</status>`;

  const res = runRegexPipeline(raw, [
    {
      id: 'pos',
      name: '正向框選 content',
      findRegex: '/[\\s\\S]*?<content>([\\s\\S]*?)<\\/content>[\\s\\S]*/gi',
      replaceString: '$1',
      enabled: true,
    },
  ]);

  assert.equal(res.cleanedText, '第一段，保留逗號。\n\n「第二段！」');
  assert.equal(res.speakable, true);
  assert.ok(res.removedSegments.length >= 1);
});

test('regexEngine: hasSpeakableContent has no min-length threshold', () => {
  assert.equal(hasSpeakableContent('嗯'), true);
  assert.equal(hasSpeakableContent('1'), true);
  assert.equal(hasSpeakableContent('……   \n！？'), false);
  assert.equal(hasSpeakableContent(''), false);
});

test('regexEngine: splitIntoSentences splits by punctuation/newlines and skips silent chunks', () => {
  const chunks = splitIntoSentences('你好！\n……\n今天下雨了。走吧？', 100);
  assert.deepEqual(chunks, ['你好！', '今天下雨了。', '走吧？']);
});

test('ttsClient: normalizes root, /v1, and full /v1/audio/speech URLs', () => {
  assert.equal(resolveTtsEndpoints('https://tts.example.com').speechUrl, 'https://tts.example.com/v1/audio/speech');
  assert.equal(resolveTtsEndpoints('https://tts.example.com/').speechUrl, 'https://tts.example.com/v1/audio/speech');
  assert.equal(resolveTtsEndpoints('https://tts.example.com/v1').speechUrl, 'https://tts.example.com/v1/audio/speech');
  assert.equal(resolveTtsEndpoints('https://tts.example.com/v1/').voicesUrl, 'https://tts.example.com/v1/voices');
  assert.equal(
    resolveTtsEndpoints('https://tts.example.com/v1/audio/speech').speechUrl,
    'https://tts.example.com/v1/audio/speech',
  );
  assert.equal(
    resolveChatEndpoint('https://api.example.com/v1/chat/completions').chatUrl,
    'https://api.example.com/v1/chat/completions',
  );
});

test('ttsClient: cache key changes when voice, speed, model, or mode changes', () => {
  const base = createDefaultSettings().tts;
  const k1 = buildCacheKey({ messageKey: 'c1::mes_0', text: '測試', ttsConfig: base, chunkIndex: 0 });
  const k2 = buildCacheKey({ messageKey: 'c1::mes_0', text: '測試', ttsConfig: { ...base, voice: 'alloy' }, chunkIndex: 0 });
  const k3 = buildCacheKey({ messageKey: 'c1::mes_0', text: '測試', ttsConfig: { ...base, speed: 1.25 }, chunkIndex: 0 });
  const k4 = buildCacheKey({ messageKey: 'c1::mes_0', text: '測試', ttsConfig: { ...base, playbackMode: 'whole' }, chunkIndex: -1 });
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
  assert.notEqual(k1, k4);
});

test('storage: independent TTS & LLM multi-profiles and two-mode reset', () => {
  const settings = createDefaultSettings();
  // Configure default TTS profile
  settings.tts.baseUrl = 'https://my-worker.workers.dev';
  settings.tts.apiKey = 'secret-tts-token';
  settings.tts.speed = 1.75;
  settings.tts.voice = 'alloy';
  syncActiveTtsProfile(settings);

  // Add a second TTS profile and switch between them
  const secondTts = addTtsProfile('Fish Audio', {}, settings);
  settings.tts.baseUrl = 'https://fish-tts.example.com/v1';
  settings.tts.apiKey = 'fish-token';
  syncActiveTtsProfile(settings);
  assert.equal(settings.ttsProfiles.length, 2);
  assert.equal(settings.activeTtsProfileId, secondTts.id);

  // Switch back to default TTS profile and confirm original values restore
  selectTtsProfile('tts_default', settings);
  assert.equal(settings.tts.baseUrl, 'https://my-worker.workers.dev');
  assert.equal(settings.tts.apiKey, 'secret-tts-token');

  // Configure default LLM profile independently of TTS
  settings.llm.baseUrl = 'https://my-llm.example.com/v1';
  settings.llm.apiKey = 'secret-llm-token';
  settings.llm.model = 'gpt-4.1-mini';
  syncActiveLlmProfile(settings);

  // Add & rename a second LLM profile
  const secondLlm = addLlmProfile('DeepSeek', {}, settings);
  renameLlmProfile(secondLlm.id, 'DeepSeek V3', settings);
  settings.llm.baseUrl = 'https://api.deepseek.com/v1';
  settings.llm.apiKey = 'ds-key';
  settings.llm.model = 'deepseek-chat';
  syncActiveLlmProfile(settings);

  const activeAuth = getEffectiveLlmAuth(settings);
  assert.equal(activeAuth.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(activeAuth.apiKey, 'ds-key');
  assert.equal(activeAuth.model, 'deepseek-chat');

  // Switch back to default LLM profile
  selectLlmProfile('llm_default', settings);
  const firstAuth = getEffectiveLlmAuth(settings);
  assert.equal(firstAuth.baseUrl, 'https://my-llm.example.com/v1');
  assert.equal(firstAuth.apiKey, 'secret-llm-token');
  assert.equal(settings.llmProfiles.find((p) => p.id === secondLlm.id)?.name, 'DeepSeek V3');

  // Cannot delete the last remaining TTS profile, but can delete one when 2 exist
  assert.equal(deleteTtsProfile(secondTts.id, settings), true);
  assert.equal(settings.ttsProfiles.length, 1);
  assert.equal(deleteTtsProfile('tts_default', settings), false);

  // Re-add a second TTS profile before testing resetKeepCredentials
  const keptTts = addTtsProfile('Backup TTS', {}, settings);
  settings.tts.baseUrl = 'https://backup-tts.example.com';
  settings.tts.apiKey = 'backup-key';
  syncActiveTtsProfile(settings);
  settings.regexRules = [];

  // resetKeepCredentials preserves ALL saved TTS & LLM profiles (URLs & Tokens) while resetting playback/rules
  resetKeepCredentials(settings);
  assert.equal(settings.ttsProfiles.length, 2);
  assert.equal(settings.llmProfiles.length, 2);
  assert.equal(settings.tts.baseUrl, 'https://backup-tts.example.com');
  assert.equal(settings.tts.apiKey, 'backup-key');
  assert.equal(settings.tts.speed, 1.0);
  assert.equal(settings.tts.voice, 'zh-TW-HsiaoChenNeural');
  assert.equal(settings.ttsProfiles.find((p) => p.id === 'tts_default')?.baseUrl, 'https://my-worker.workers.dev');
  assert.equal(settings.llmProfiles.find((p) => p.id === secondLlm.id)?.apiKey, 'ds-key');
  assert.equal(settings.activeTtsProfileId, keptTts.id);
  assert.ok(settings.regexRules.length > 0);

  // resetAll clears all profiles back to single empty default each
  resetAll(settings);
  assert.equal(settings.ttsProfiles.length, 1);
  assert.equal(settings.llmProfiles.length, 1);
  assert.equal(settings.tts.baseUrl, '');
  assert.equal(settings.tts.apiKey, '');
  assert.equal(settings.llm.baseUrl, '');
  assert.equal(settings.llm.apiKey, '');
});

test('regexAgent: parses fenced JSON rules and detects residual non-body tags in sandbox', () => {
  const reply = '說明如下\n```json\n{"analysis":"移除思考","rules":[{"name":"think","findRegex":"/<think>[\\\\s\\\\S]*?<\\\\/think>/gi","replaceString":"","enabled":true}]}\n```';
  const parsed = extractRulesFromLlmReply(reply);
  assert.ok(parsed);
  assert.equal(parsed.rules.length, 1);

  const dirtyPipeline = runRegexPipeline('<think>a</think><status>HP 10</status>正文', parsed.rules);
  const issues = inspectSandboxResult(dirtyPipeline);
  assert.ok(issues.some((i) => i.includes('殘留')));
});

test('zipBuilder: creates valid ZIP archive with PK signatures', () => {
  const zip = buildZipArchive([
    { path: 'st-direct-tts/manifest.json', content: '{"display_name":"test"}' },
    { path: 'st-direct-tts/index.js', content: 'export const x = 1;' },
  ]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50); // Local header PK\x03\x04
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50); // EOCD PK\x05\x06
});
