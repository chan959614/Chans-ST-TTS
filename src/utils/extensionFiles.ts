/**
 * Single-source-of-truth registry of the real extension files living at repository root (/).
 * Imported via Vite ?raw so source viewer and ZIP export always match the exact Git-installable files.
 */

import manifestRaw from '../../manifest.json?raw';
import indexRaw from '../../index.js?raw';
import styleRaw from '../../style.css?raw';
import readmeRaw from '../../README.md?raw';
import constantsRaw from '../../lib/constants.js?raw';
import storageRaw from '../../lib/storage.js?raw';
import regexEngineRaw from '../../lib/regexEngine.js?raw';
import messageSourceRaw from '../../lib/messageSource.js?raw';
import ttsClientRaw from '../../lib/ttsClient.js?raw';
import audioPlayerRaw from '../../lib/audioPlayer.js?raw';
import gestureHandlerRaw from '../../lib/gestureHandler.js?raw';
import regexAgentRaw from '../../lib/regexAgent.js?raw';
import uiRaw from '../../lib/ui.js?raw';
import { buildZipArchive } from './zipBuilder';

export interface ExtensionFileDescriptor {
  path: string;
  role: string;
  content: string;
}

export const EXTENSION_FILES: ExtensionFileDescriptor[] = [
  { path: 'manifest.json', role: '擴充資訊與進入點清單（位於倉庫根目錄）', content: manifestRaw },
  { path: 'index.js', role: '主進入點（零打包原生 ES Module）', content: indexRaw },
  { path: 'style.css', role: 'SillyTavern 亮暗主題適配與 44px 觸控樣式', content: styleRaw },
  { path: 'lib/constants.js', role: '預設值、離線音色清單與常用正則範本', content: constantsRaw },
  { path: 'lib/storage.js', role: 'extensionSettings 持久化與雙模式重設', content: storageRaw },
  { path: 'lib/regexEngine.js', role: '正則清洗管線、ReDoS 靜態防護與切句器', content: regexEngineRaw },
  { path: 'lib/messageSource.js', role: 'Raw 原文優先讀取與 TauriTavern 相容層', content: messageSourceRaw },
  { path: 'lib/ttsClient.js', role: 'OpenAI TTS / worker.js 接口與 Blob URL 快取', content: ttsClientRaw },
  { path: 'lib/audioPlayer.js', role: '安卓 WebView 單例解鎖與分段預載播放器', content: audioPlayerRaw },
  { path: 'lib/gestureHandler.js', role: '桌面雙擊、手機雙擊與同源 iframe 座標轉換', content: gestureHandlerRaw },
  { path: 'lib/regexAgent.js', role: 'AI 正則助手與本地沙盒自動迭代驗證', content: regexAgentRaw },
  { path: 'lib/ui.js', role: '浮動雙項選單、迷你控制條與設定面板', content: uiRaw },
  { path: 'README.md', role: 'SillyTavern 與 TauriTavern 安裝與使用說明', content: readmeRaw },
];

export async function fetchAllExtensionFiles(): Promise<Record<string, string>> {
  return Object.fromEntries(EXTENSION_FILES.map((f) => [f.path, f.content]));
}

/**
 * Package the extension with manifest.json directly at the ZIP root so
 * ZIP importers do not fail on nested wrapper folders.
 */
export async function downloadExtensionZip(): Promise<void> {
  const zipBytes = buildZipArchive(
    EXTENSION_FILES.map((f) => ({
      path: f.path,
      content: f.content,
    })),
  );
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'st-direct-tts-extension.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
