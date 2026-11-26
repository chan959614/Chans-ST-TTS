/**
 * ST Direct TTS — AI Regex Assistant (OpenAI-compatible /v1/chat/completions).
 *
 * Workflow:
 * 1. Fetches latest AI message Raw text (or uses user-supplied sample).
 * 2. Guides LLM to prefer positive extraction (<content>...</content> -> $1) when an explicit
 *    body wrapper exists, otherwise removes non-body blocks (<think>, status HUD, comments, JSON)
 *    without touching body punctuation or line breaks.
 * 3. Automatically runs proposed rules in our real local regexEngine sandbox and checks for:
 *    - Syntax / ReDoS warnings
 *    - Accidental empty output
 *    - Obvious leftover non-body tags (<think>, <thinking>, <status>, <!--, ```)
 * 4. If issues remain, feeds the sandbox diff back to the LLM for automatic refinement (up to N rounds).
 */

import { runRegexPipeline } from './regexEngine.js';
import { resolveChatEndpoint } from './ttsClient.js';

const SYSTEM_PROMPT = `你是 SillyTavern / TauriTavern 語音朗讀插件的「正則過濾助手」。
你的任務是根據使用者提供的「聊天原始文本（Raw）」，設計最小化、精準的 JavaScript 正則替換規則，用來剔除非正文區塊（思考過程、狀態欄、HTML/CSS 卡片、JSON 資料、註解、系統提示等），留下純粹適合 TTS 朗讀的正文。

請嚴格遵守以下設計原則：
1. **優先正向框選（但先清思考標籤）**：若原文存在明確包覆正文的外層標籤（例如 <content>...</content>、<story>...</story>、<main>...</main>），優先用一條正向框選規則抽出正文（例如 findRegex: "/[\\\\s\\\\S]*?<content>([\\\\s\\\\S]*?)<\\\\/content>[\\\\s\\\\S]*/gi", replaceString: "$1"）。若原文同時含有 <think>/<thinking>，請先加一條移除思考標籤的規則排在最前面，避免思考過程中提及標籤名稱造成誤配。
2. **無明確外層標籤時再逐項剔除**：只刪除明確的非正文區塊（如 <think>、<thinking>、<status>、<details>、<!--...-->、\`\`\`...\`\`\` 狀態區塊等）。
3. **禁止更動正文排版與標點**：絕不可合併換行、刪除全形/半形標點或修改角色對話內容，因為 TTS 依賴換行與標點產生自然停頓。
4. **避免 ReDoS 危險正則**：禁止巢狀量詞（如 (a+)+ 或 (.*)*），一律使用安全的惰性匹配 [\\s\\S]*?。
5. **輸出格式**：請在回覆末尾附上一個 \`\`\`json 區塊，格式嚴格如下：
\`\`\`json
{
  "analysis": "簡短說明原文結構與設計策略",
  "rules": [
    {
      "name": "規則名稱",
      "findRegex": "/pattern/gi",
      "replaceString": "",
      "enabled": true
    }
  ]
}
\`\`\``;

/**
 * Extract structured JSON rule proposal from an LLM assistant message.
 */
export function extractRulesFromLlmReply(content) {
  if (typeof content !== 'string') return null;

  // Prefer fenced ```json ... ``` block
  const fencedMatches = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const candidates = fencedMatches.map((m) => m[1].trim());

  // Fallback: outermost JSON object containing "rules"
  const braceMatch = content.match(/\{[\s\S]*"rules"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (braceMatch) candidates.push(braceMatch[0]);

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.rules)) {
        const sanitized = parsed.rules
          .filter((r) => r && typeof r.findRegex === 'string' && r.findRegex.trim().length > 0)
          .map((r, idx) => ({
            id: `agent_rule_${Date.now()}_${idx}`,
            name: String(r.name || `AI 規則 #${idx + 1}`).slice(0, 60),
            findRegex: String(r.findRegex).trim(),
            replaceString: typeof r.replaceString === 'string' ? r.replaceString : '',
            enabled: r.enabled !== false,
          }));

        if (sanitized.length > 0) {
          return {
            analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
            rules: sanitized,
          };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

/**
 * Inspect sandbox cleaned output for obvious leftover non-body artifacts or pipeline failures.
 */
export function inspectSandboxResult(pipelineResult) {
  const issues = [];

  if (pipelineResult.warnings.length > 0) {
    issues.push(...pipelineResult.warnings);
  }
  if (!pipelineResult.speakable) {
    issues.push('篩選結果為空或無可朗讀文字，正則可能過度刪除正文。');
  }

  const out = pipelineResult.cleanedText || '';
  if (/<\/?(?:think|thinking|status|details|style|script)\b/i.test(out)) {
    issues.push('篩選後仍殘留 <think>/<status>/<style> 等非正文標籤。');
  }
  if (/<!--[\s\S]*?-->/.test(out)) {
    issues.push('篩選後仍殘留 HTML 註解 <!-- ... -->。');
  }
  if (/```[\s\S]*?```/.test(out)) {
    issues.push('篩選後仍殘留程式碼／JSON 圍欄區塊 ```...```。');
  }

  return issues;
}

/**
 * Call OpenAI-compatible /v1/chat/completions.
 */
async function callChatCompletion({ auth, messages, signal }) {
  const endpoint = resolveChatEndpoint(auth.baseUrl);
  if (!endpoint.valid) {
    throw new Error('請先設定 AI 正則助手的 Base URL（或勾選「共用 TTS 網址與 Token」）');
  }

  const headers = { 'Content-Type': 'application/json' };
  const key = (auth.apiKey || '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const resp = await fetch(endpoint.chatUrl, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: (auth.model || 'gpt-4o-mini').trim(),
      temperature: 0.2,
      messages,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed?.error?.message || parsed?.error || text;
    } catch {
      // Keep raw text
    }
    throw new Error(`LLM 請求失敗 (HTTP ${resp.status})：${msg || resp.statusText}`);
  }

  const data = await resp.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('LLM 未回傳有效的回覆內容');
  }
  return reply;
}

/**
 * Run the full AI Regex Agent workflow with automatic local sandbox testing & self-correction.
 */
export async function runRegexAgentTurn({
  auth,
  rawText,
  sourceLabel,
  userPrompt,
  currentRules = [],
  maxAutoRetries = 2,
  signal,
  onProgress = () => {},
}) {
  const boundedRaw = rawText.length > 8000 ? `${rawText.slice(0, 8000)}\n...(已截斷剩餘 ${rawText.length - 8000} 字)` : rawText;

  const currentRuleSummary = currentRules.length
    ? `\n目前啟用中的規則供參考：\n${JSON.stringify(
        currentRules.map(({ name, findRegex, replaceString, enabled }) => ({ name, findRegex, replaceString, enabled })),
        null,
        2,
      )}`
    : '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${userPrompt || '請分析以下聊天原文，產生精準的正則過濾規則，只保留需要朗讀的正文。'}\n\n資料來源：${sourceLabel || '使用者提供原文'}\n${currentRuleSummary}\n\n【原始文本 Raw】\n${boundedRaw}`,
    },
  ];

  const retries = Math.max(0, Math.min(3, Number(maxAutoRetries) ?? 2));
  let bestProposal = null;
  let bestTest = null;
  let lastReply = '';
  let attempts = 0;

  for (let round = 0; round <= retries; round++) {
    attempts = round + 1;
    onProgress(round === 0 ? '正在向 LLM 請求正則建議…' : `沙盒發現殘留或異常，自動迭代修正中（第 ${round + 1} 輪）…`);

    lastReply = await callChatCompletion({ auth, messages, signal });
    messages.push({ role: 'assistant', content: lastReply });

    const proposal = extractRulesFromLlmReply(lastReply);
    if (!proposal) {
      if (round < retries) {
        messages.push({
          role: 'user',
          content: '未能從你的回覆中解析出有效的 ```json 規則陣列。請務必回傳包含 "rules" 陣列的合法 JSON 區塊。',
        });
        continue;
      }
      break;
    }

    // Automatically run the proposed rules in the real local regex engine sandbox
    const testResult = runRegexPipeline(rawText, proposal.rules);
    const issues = inspectSandboxResult(testResult);

    bestProposal = proposal;
    bestTest = testResult;

    if (issues.length === 0) {
      onProgress('沙盒驗證通過，無非正文殘留。');
      return {
        ok: true,
        attempts,
        analysis: proposal.analysis,
        rawReply: lastReply,
        rules: proposal.rules,
        sandboxResult: testResult,
        remainingIssues: [],
      };
    }

    if (round < retries) {
      const previewCleaned =
        testResult.cleanedText.length > 2500
          ? `${testResult.cleanedText.slice(0, 2500)}...(截斷)`
          : testResult.cleanedText;

      messages.push({
        role: 'user',
        content: [
          `插件已在本地沙盒實際執行你提出的規則，偵測到以下問題：`,
          issues.map((x, idx) => `${idx + 1}. ${x}`).join('\n'),
          ``,
          `篩選前字數：${testResult.rawLength} → 篩選後字數：${testResult.cleanedLength}`,
          `【沙盒篩選後結果】`,
          previewCleaned || '(空字串)',
          ``,
          `請修正規則並重新輸出完整的 \`\`\`json 區塊。`,
        ].join('\n'),
      });
    } else {
      return {
        ok: true,
        attempts,
        analysis: proposal.analysis,
        rawReply: lastReply,
        rules: proposal.rules,
        sandboxResult: testResult,
        remainingIssues: issues,
      };
    }
  }

  return {
    ok: false,
    attempts,
    analysis: '',
    rawReply: lastReply,
    rules: bestProposal?.rules || [],
    sandboxResult: bestTest,
    remainingIssues: ['無法解析出有效正則規則，請調整提示詞或更換模型再試。'],
  };
}
