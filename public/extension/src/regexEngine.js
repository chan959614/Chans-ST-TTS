/**
 * ST Direct TTS — Pure Regex Cleaning Pipeline, Static ReDoS Guard & Sentence Splitter.
 * Strictly removes non-body blocks without merging line breaks or altering punctuation.
 */

const VALID_FLAGS = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
const MAX_PATTERN_LENGTH = 2000;

/**
 * Check whether text contains at least one speakable letter or digit.
 * No minimum length threshold: even 1 character like "嗯" or "1" is speakable.
 */
export function hasSpeakableContent(text) {
  return typeof text === 'string' && /[\p{L}\p{N}]/u.test(text);
}

/**
 * Static ReDoS heuristic detector.
 * Flags catastrophic backtracking constructs before executing regex on user text.
 */
export function analyzeRegexSafety(pattern) {
  const warnings = [];
  if (typeof pattern !== 'string') {
    return { safe: false, warnings: ['正則表達式必須為字串'] };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { safe: false, warnings: [`規則長度超過 ${MAX_PATTERN_LENGTH} 字元上限`] };
  }

  // Strip escaped characters and character classes to inspect group quantifier nesting
  const stripped = stripCharClassesAndEscapes(pattern);

  // 1. Nested quantifiers inside a quantified group, e.g. (a+)+, (.*)*, (a{2,})+, ([\s\S]+)+
  const groupStack = [];
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '(') {
      groupStack.push({ hasQuantifier: false, hasAlternation: false });
    } else if (ch === '|' && groupStack.length > 0) {
      groupStack[groupStack.length - 1].hasAlternation = true;
    } else if (ch === ')' && groupStack.length > 0) {
      const top = groupStack.pop();
      const next = stripped[i + 1];
      const nextIsQuantifier = next === '+' || next === '*' || next === '{';
      if (nextIsQuantifier) {
        if (top.hasQuantifier) {
          warnings.push('偵測到巢狀量詞（如 (a+)+ 或 (.*)*），可能引發 ReDoS 導致頁面卡死');
        }
        if (top.hasAlternation && /\([^()]*\|[^()]*\)[+*{]/.test(stripped)) {
          // Check simple overlapping alternation inside quantified group
          const overlapMatch = stripped.match(/\(([^()|]+)\|([^()|]+)\)[+*{]/);
          if (overlapMatch && (overlapMatch[1] === overlapMatch[2] || overlapMatch[1].includes(overlapMatch[2]) || overlapMatch[2].includes(overlapMatch[1]))) {
            warnings.push('偵測到重疊分支搭配量詞，可能導致指數級回溯');
          }
        }
      }
      if (groupStack.length > 0 && (top.hasQuantifier || nextIsQuantifier)) {
        groupStack[groupStack.length - 1].hasQuantifier = true;
      }
    } else if ((ch === '+' || ch === '*' || ch === '{') && groupStack.length > 0) {
      // Mark current group as containing an unbounded quantifier (ignore lazy `?` right after quantifier)
      if (ch === '{') {
        const closeBrace = stripped.indexOf('}', i);
        const body = closeBrace > i ? stripped.slice(i + 1, closeBrace) : '';
        if (body.includes(',')) {
          groupStack[groupStack.length - 1].hasQuantifier = true;
        }
      } else {
        groupStack[groupStack.length - 1].hasQuantifier = true;
      }
    }
  }

  // 2. Adjacent unbounded wildcards like .*.* or [\s\S]*[\s\S]*
  if (/(\.\*|\.\+)(\.\*|\.\+)/.test(stripped)) {
    warnings.push('偵測到相鄰無限通配符（如 .*.*），可能引起嚴重回溯');
  }

  // 3. Backreferences under quantifiers like (.*)\1+
  if (/\\[1-9][+*{]/.test(pattern)) {
    warnings.push('偵測到量詞修飾的反向引用，可能導致效能退化');
  }

  return {
    safe: warnings.length === 0,
    warnings: [...new Set(warnings)],
  };
}

function stripCharClassesAndEscapes(pattern) {
  let out = '';
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      // Replace escaped char with neutral placeholder
      out += 'x';
      i++;
      continue;
    }
    if (ch === '[' && !inClass) {
      inClass = true;
      out += 'x';
      continue;
    }
    if (ch === ']' && inClass) {
      inClass = false;
      continue;
    }
    if (!inClass) out += ch;
  }
  return out;
}

/**
 * Parse a rule's findRegex field.
 * Supports:
 *   - Regex literal syntax: /pattern/flags (automatically ensures 'g' flag unless 'y' is set)
 *   - Plain literal string: matched globally via literal string replacement
 */
export function parseRulePattern(findRegex) {
  if (typeof findRegex !== 'string' || !findRegex.length) {
    return { kind: 'empty', error: '查找規則為空' };
  }

  // Detect /pattern/flags literal
  if (findRegex.startsWith('/') && findRegex.length >= 2) {
    let lastSlash = -1;
    for (let i = findRegex.length - 1; i > 0; i--) {
      if (findRegex[i] === '/') {
        // Count preceding backslashes to make sure slash isn't escaped
        let bs = 0;
        for (let j = i - 1; j >= 0 && findRegex[j] === '\\'; j--) bs++;
        if (bs % 2 === 0) {
          lastSlash = i;
          break;
        }
      }
    }

    if (lastSlash > 0) {
      const body = findRegex.slice(1, lastSlash);
      const rawFlags = findRegex.slice(lastSlash + 1);
      const allValid = [...rawFlags].every((f) => VALID_FLAGS.has(f));

      if (allValid) {
        const safety = analyzeRegexSafety(body);
        if (!safety.safe) {
          return {
            kind: 'unsafe',
            pattern: body,
            flags: rawFlags,
            error: safety.warnings.join('；'),
            warnings: safety.warnings,
          };
        }

        const flagSet = new Set(rawFlags.split(''));
        if (!flagSet.has('g') && !flagSet.has('y')) {
          flagSet.add('g');
        }
        const normalizedFlags = [...flagSet].join('');

        try {
          const regex = new RegExp(body, normalizedFlags);
          return {
            kind: 'regex',
            regex,
            pattern: body,
            flags: normalizedFlags,
          };
        } catch (err) {
          return {
            kind: 'invalid',
            pattern: body,
            flags: rawFlags,
            error: `正則語法錯誤：${err.message}`,
          };
        }
      }
    }
  }

  // Plain string global replacement
  return {
    kind: 'literal',
    literal: findRegex,
  };
}

/**
 * Unescape common replacement escape sequences (\n, \t) if user wrote literal backslash escapes,
 * while preserving $1, $2, $& capture references intact.
 */
function normalizeReplaceString(replaceString) {
  if (typeof replaceString !== 'string') return '';
  return replaceString.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

/**
 * Execute all enabled regex rules in order against rawText.
 * Preserves original newlines and punctuation inside the remaining body.
 * Returns rich diagnostics for Before/After comparison panels.
 */
export function runRegexPipeline(rawText, rules = []) {
  const input = typeof rawText === 'string' ? rawText : '';
  let current = input;
  const steps = [];
  const removedSegments = [];
  const warnings = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || rule.enabled === false) continue;

    const ruleLabel = rule.name?.trim() || `規則 #${i + 1}`;
    const parsed = parseRulePattern(rule.findRegex);
    const replacement = normalizeReplaceString(rule.replaceString ?? '');

    if (parsed.kind === 'empty') {
      continue;
    }
    if (parsed.kind === 'unsafe' || parsed.kind === 'invalid') {
      const msg = `[${ruleLabel}] 已略過：${parsed.error}`;
      warnings.push(msg);
      steps.push({
        ruleId: rule.id || String(i),
        name: ruleLabel,
        matchedCount: 0,
        charsDelta: 0,
        skipped: true,
        error: parsed.error,
      });
      continue;
    }

    const before = current;
    let matchedCount = 0;

    try {
      if (parsed.kind === 'regex') {
        // Capture removed/replaced snippets for inspection
        const probe = new RegExp(parsed.regex.source, parsed.regex.flags);
        const ruleRemoved = [];
        current = before.replace(probe, (...args) => {
          matchedCount++;
          const fullMatch = args[0];
          // Compute actual replacement for this match
          const replaced = applyReplacementTemplate(fullMatch, args, replacement);
          if (fullMatch && fullMatch !== replaced) {
            // For positive-extraction rules where entire string matched, show excluded parts
            if (replaced.length > 0 && fullMatch.includes(replaced)) {
              const idx = fullMatch.indexOf(replaced);
              const prefix = fullMatch.slice(0, idx).trim();
              const suffix = fullMatch.slice(idx + replaced.length).trim();
              if (prefix) ruleRemoved.push(prefix);
              if (suffix) ruleRemoved.push(suffix);
            } else if (replaced.length === 0) {
              const trimmed = fullMatch.trim();
              if (trimmed) ruleRemoved.push(trimmed);
            } else {
              ruleRemoved.push(fullMatch.trim());
            }
          }
          return replaced;
        });

        for (const snippet of ruleRemoved) {
          removedSegments.push({
            ruleName: ruleLabel,
            text: snippet,
          });
        }
      } else if (parsed.kind === 'literal') {
        const parts = before.split(parsed.literal);
        matchedCount = Math.max(0, parts.length - 1);
        if (matchedCount > 0) {
          current = parts.join(replacement);
          if (parsed.literal !== replacement) {
            removedSegments.push({
              ruleName: ruleLabel,
              text: `${parsed.literal} (×${matchedCount})`,
            });
          }
        }
      }
    } catch (err) {
      const msg = `[${ruleLabel}] 執行失敗：${err.message}`;
      warnings.push(msg);
      current = before;
    }

    steps.push({
      ruleId: rule.id || String(i),
      name: ruleLabel,
      matchedCount,
      charsDelta: current.length - before.length,
      skipped: false,
      error: null,
    });
  }

  // Only trim leading/trailing blank outer whitespace; NEVER collapse internal newlines or punctuation
  const cleanedText = current.trim();
  const speakable = hasSpeakableContent(cleanedText);

  if (input.trim().length > 0 && !speakable) {
    warnings.push('清洗後不含任何可朗讀字元，請檢查正則是否誤刪正文。');
  }

  return {
    rawText: input,
    cleanedText,
    rawLength: input.length,
    cleanedLength: cleanedText.length,
    speakable,
    steps,
    removedSegments,
    warnings,
  };
}

function applyReplacementTemplate(fullMatch, args, template) {
  // args from String.prototype.replace: [match, p1, p2, ..., offset, wholeString, groups?]
  const hasNamedGroups = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null;
  const groups = hasNamedGroups ? args[args.length - 1] : null;
  const captures = args.slice(1, hasNamedGroups ? -3 : -2);

  return template.replace(/\$(\$|&|`|\'|\d{1,2}|<[^>]+>)/g, (token, key) => {
    if (key === '$') return '$';
    if (key === '&') return fullMatch;
    if (key.startsWith('<') && key.endsWith('>')) {
      const name = key.slice(1, -1);
      return groups && name in groups ? (groups[name] ?? '') : '';
    }
    const idx = Number(key);
    if (Number.isInteger(idx) && idx >= 1 && idx <= captures.length) {
      return captures[idx - 1] ?? '';
    }
    return token;
  });
}

/**
 * Split cleaned text into ordered speakable sentence chunks for queue prefetch mode.
 * Splits along sentence-ending punctuation ([。！？!?…\n]+) and enforces maxChars
 * without losing punctuation pauses. Silently skips pure punctuation / whitespace chunks.
 */
export function splitIntoSentences(text, maxChars = 220) {
  if (!text || typeof text !== 'string') return [];
  const limit = Math.max(40, Math.min(2000, Number(maxChars) || 220));

  // Step 1: Split into natural lines first (preserving paragraph breaks)
  const lines = text.split(/\n+/);
  const rawSentences = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Split by sentence-ending punctuation, keeping punctuation attached to sentence
    // Also handle closing quotes/brackets immediately following punctuation: 。」 ！』 ？」
    const matcher = /[^。！？!?…]+(?:[。！？!?…]+(?:[」』"'”）)\]]*))?/g;
    const matches = trimmedLine.match(matcher);
    if (!matches) {
      rawSentences.push(trimmedLine);
      continue;
    }

    for (const seg of matches) {
      const s = seg.trim();
      if (s) rawSentences.push(s);
    }
  }

  // Step 2: Enforce maxChars on very long sentences (split at secondary punctuation or spaces)
  const sized = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= limit) {
      sized.push(sentence);
    } else {
      sized.push(...splitLongSentence(sentence, limit));
    }
  }

  // Step 3: Filter out silent chunks (pure punctuation/whitespace)
  return sized.filter(hasSpeakableContent);
}

function splitLongSentence(sentence, limit) {
  const result = [];
  let rest = sentence;
  const secondaryBreaks = [/[；;，,、：:]/, /\s/];

  while (rest.length > limit) {
    let splitAt = -1;
    const minCut = Math.floor(limit * 0.4);

    for (const re of secondaryBreaks) {
      for (let i = limit - 1; i >= minCut; i--) {
        if (re.test(rest[i])) {
          splitAt = i + 1;
          break;
        }
      }
      if (splitAt > 0) break;
    }

    if (splitAt <= 0) splitAt = limit;
    const piece = rest.slice(0, splitAt).trim();
    if (piece) result.push(piece);
    rest = rest.slice(splitAt).trim();
  }

  if (rest) result.push(rest);
  return result;
}
