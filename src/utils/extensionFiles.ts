/**
 * Registry of all pure ES module files comprising the SillyTavern / TauriTavern extension.
 * Served directly from /public/extension/ without any bundling or obfuscation.
 */

import { buildZipArchive } from './zipBuilder';

export interface ExtensionFileDescriptor {
  path: string;
  publicUrl: string;
  role: string;
}

export const EXTENSION_FILES: ExtensionFileDescriptor[] = [
  { path: 'manifest.json', publicUrl: '/extension/manifest.json', role: '擴充資訊與進入點清單' },
  { path: 'index.js', publicUrl: '/extension/index.js', role: '主進入點（零打包原生 ES Module）' },
  { path: 'style.css', publicUrl: '/extension/style.css', role: 'SillyTavern 亮暗主題適配與 44px 觸控樣式' },
  { path: 'src/constants.js', publicUrl: '/extension/src/constants.js', role: '預設值、離線音色清單與常用正則範本' },
  { path: 'src/storage.js', publicUrl: '/extension/src/storage.js', role: 'extensionSettings 持久化與雙模式重設' },
  { path: 'src/regexEngine.js', publicUrl: '/extension/src/regexEngine.js', role: '正則清洗管線、ReDoS 靜態防護與切句器' },
  { path: 'src/messageSource.js', publicUrl: '/extension/src/messageSource.js', role: 'Raw 原文優先讀取與 TauriTavern 相容層' },
  { path: 'src/ttsClient.js', publicUrl: '/extension/src/ttsClient.js', role: 'OpenAI TTS / worker.js 接口與 Blob URL 快取' },
  { path: 'src/audioPlayer.js', publicUrl: '/extension/src/audioPlayer.js', role: '安卓 WebView 單例解鎖與分段預載播放器' },
  { path: 'src/gestureHandler.js', publicUrl: '/extension/src/gestureHandler.js', role: '桌面雙擊、手機雙擊與同源 iframe 座標轉換' },
  { path: 'src/regexAgent.js', publicUrl: '/extension/src/regexAgent.js', role: 'AI 正則助手與本地沙盒自動迭代驗證' },
  { path: 'src/ui.js', publicUrl: '/extension/src/ui.js', role: '浮動雙項選單、迷你控制條與設定面板' },
  { path: 'README.md', publicUrl: '/extension/README.md', role: 'SillyTavern 與 TauriTavern 安裝與使用說明' },
];

export async function fetchAllExtensionFiles(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    EXTENSION_FILES.map(async (f) => {
      const resp = await fetch(f.publicUrl, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`無法載入 ${f.path} (HTTP ${resp.status})`);
      return [f.path, await resp.text()] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function downloadExtensionZip(): Promise<void> {
  const map = await fetchAllExtensionFiles();
  const zipBytes = buildZipArchive(
    EXTENSION_FILES.map((f) => ({
      path: `st-direct-tts/${f.path}`,
      content: map[f.path] ?? '',
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
