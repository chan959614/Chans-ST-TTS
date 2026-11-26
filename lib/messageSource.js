/**
 * ST Direct TTS — Raw Message Extractor (SillyTavern + TauriTavern compatible).
 * Priority:
 *   1. SillyTavern.getContext().chat[mesId].mes (Raw unrendered markdown/tags)
 *   2. TauriTavern backend API fallback (if windowed chat payload omits mesId)
 *   3. DOM .mes_text textContent fallback (excluding hidden reasoning containers)
 */

import { getSTContext } from './storage.js';

/**
 * Extract message floor ID from a .mes DOM element.
 */
export function getMesIdFromElement(mesElement) {
  if (!mesElement) return null;
  const raw = mesElement.getAttribute?.('mesid') ?? mesElement.dataset?.mesid;
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  return Number.isInteger(num) && num >= 0 ? num : null;
}

/**
 * Resolve raw text for a given floor element and/or mesId.
 * Returns { mesId, text, sourceType, sourceLabel, speakerName, isUser, chatId }.
 */
export async function resolveMessageText({ mesElement = null, mesId = null } = {}) {
  const resolvedMesId = mesId !== null && mesId !== undefined ? Number(mesId) : getMesIdFromElement(mesElement);
  const ctx = getSTContext();
  const chatId = ctx?.chatId ?? 'default_chat';

  // 1. Primary: SillyTavern context.chat[mesId].mes (Raw text)
  if (resolvedMesId !== null && Array.isArray(ctx?.chat)) {
    const entry = ctx.chat[resolvedMesId];
    if (entry && typeof entry.mes === 'string') {
      return {
        mesId: resolvedMesId,
        text: entry.mes,
        sourceType: 'raw',
        sourceLabel: `第 ${resolvedMesId} 樓 Raw 原文`,
        speakerName: entry.name || (entry.is_user ? '使用者' : '角色'),
        isUser: Boolean(entry.is_user),
        chatId,
      };
    }
  }

  // 2. Secondary: TauriTavern windowed-payload backend lookup (best-effort)
  if (resolvedMesId !== null && typeof globalThis !== 'undefined' && globalThis.__TAURITAVERN__?.api?.chat) {
    try {
      const ttChat = globalThis.__TAURITAVERN__.api.chat;
      if (typeof ttChat.getMessage === 'function') {
        const entry = await ttChat.getMessage(resolvedMesId);
        if (entry && typeof entry.mes === 'string') {
          return {
            mesId: resolvedMesId,
            text: entry.mes,
            sourceType: 'raw',
            sourceLabel: `第 ${resolvedMesId} 樓 Raw 原文 (TauriTavern)`,
            speakerName: entry.name || '角色',
            isUser: Boolean(entry.is_user),
            chatId,
          };
        }
      }
    } catch {
      // Fall through cleanly to DOM fallback
    }
  }

  // 3. Fallback: DOM .mes_text plain text (clone & strip .mes_reasoning / buttons)
  const targetMes = mesElement || (resolvedMesId !== null ? document.querySelector(`.mes[mesid="${resolvedMesId}"]`) : null);
  const textNode = targetMes?.querySelector?.('.mes_text');
  if (textNode) {
    const clone = textNode.cloneNode(true);
    clone.querySelectorAll?.('.mes_reasoning, .mes_reasoning_details, style, script, button').forEach((n) => n.remove());
    const domText = (clone.innerText ?? clone.textContent ?? '').trim();
    const speaker = targetMes.querySelector?.('.name_text')?.textContent?.trim() || '訊息';
    return {
      mesId: resolvedMesId,
      text: domText,
      sourceType: 'dom',
      sourceLabel: resolvedMesId !== null ? `第 ${resolvedMesId} 樓 DOM 後備文本` : 'DOM 後備文本',
      speakerName: speaker,
      isUser: targetMes.getAttribute?.('is_user') === 'true',
      chatId,
    };
  }

  return {
    mesId: resolvedMesId,
    text: '',
    sourceType: 'none',
    sourceLabel: '找不到訊息內容',
    speakerName: '',
    isUser: false,
    chatId,
  };
}

/**
 * Fetch the latest AI (non-user, non-system) message's Raw text.
 * Used by the manual regex tester and the AI Regex Agent.
 */
export async function fetchLatestAiMessage() {
  const ctx = getSTContext();
  const chatId = ctx?.chatId ?? 'default_chat';

  // 1. Scan SillyTavern context.chat backwards
  if (Array.isArray(ctx?.chat) && ctx.chat.length > 0) {
    for (let i = ctx.chat.length - 1; i >= 0; i--) {
      const m = ctx.chat[i];
      if (!m || typeof m.mes !== 'string' || !m.mes.trim()) continue;
      if (m.is_user || m.is_system) continue;
      return {
        mesId: i,
        text: m.mes,
        sourceType: 'raw',
        sourceLabel: `第 ${i} 樓 Raw 原文（最新 AI 回覆）`,
        speakerName: m.name || '角色',
        isUser: false,
        chatId,
      };
    }
    // If all messages are user messages, fall back to the last non-empty message
    for (let i = ctx.chat.length - 1; i >= 0; i--) {
      const m = ctx.chat[i];
      if (m && typeof m.mes === 'string' && m.mes.trim()) {
        return {
          mesId: i,
          text: m.mes,
          sourceType: 'raw',
          sourceLabel: `第 ${i} 樓 Raw 原文`,
          speakerName: m.name || '訊息',
          isUser: Boolean(m.is_user),
          chatId,
        };
      }
    }
  }

  // 2. TauriTavern native findLastMessage() API if available
  if (typeof globalThis !== 'undefined' && globalThis.__TAURITAVERN__?.api?.chat?.findLastMessage) {
    try {
      const found = await globalThis.__TAURITAVERN__.api.chat.findLastMessage((m) => !m.is_user && !m.is_system);
      if (found && typeof found.mes === 'string') {
        const id = found.mesid ?? found.index ?? null;
        return {
          mesId: id,
          text: found.mes,
          sourceType: 'raw',
          sourceLabel: id !== null ? `第 ${id} 樓 Raw 原文 (TauriTavern)` : 'Raw 原文 (TauriTavern)',
          speakerName: found.name || '角色',
          isUser: false,
          chatId,
        };
      }
    } catch {
      // Fall through to DOM
    }
  }

  // 3. DOM fallback: last non-user .mes element
  if (typeof document !== 'undefined') {
    const allMes = [...document.querySelectorAll('#chat .mes, .mes')];
    for (let i = allMes.length - 1; i >= 0; i--) {
      const el = allMes[i];
      if (el.getAttribute('is_user') === 'true') continue;
      const res = await resolveMessageText({ mesElement: el });
      if (res.text) return res;
    }
  }

  return {
    mesId: null,
    text: '',
    sourceType: 'none',
    sourceLabel: '目前聊天室無可讀取的訊息',
    speakerName: '',
    isUser: false,
    chatId,
  };
}
