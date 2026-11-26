# ST Direct TTS — SillyTavern / TauriTavern 第三方語音直讀插件

純前端原生 ES Module 實作（免打包、免混淆、免額外後端），`manifest.json`、`index.js`、`style.css` 與 `lib/*.js` 皆位於倉庫根目錄，可直接供 **TauriTavern（安卓／桌面）** 與 **SillyTavern** 透過 Git 網址一鍵安裝。

## 安裝方式
1. **Git 網址直接安裝（推薦）**：在 TauriTavern 或 SillyTavern 的「擴展 → 安裝擴展」直接貼上本倉庫的 Git 網址即可安裝。
2. **手動 ZIP 安裝**：下載插件壓縮檔，解壓至 `public/scripts/extensions/third-party/st-direct-tts/`（確保 `manifest.json` 位於資料夾第一層）。
3. 重新整理後，於「擴展」抽屜展開 **ST Direct TTS 語音朗讀** 設定面板。

## 核心功能
- **雙擊任一樓層訊息**（文字區、空白留白處或同源內嵌 iframe 皆可）彈出 2 項目選單：**朗讀** 與 **重製朗讀**。
- **無縫對接 OpenAI TTS 與 Edge TTS Worker (`worker.js`)**：自動正規化根網址／`/v1`／`/v1/audio/speech`，支援 `/v1/voices` 音色載入、整則一次或按句預載佇列、`mp3` / `opus` 與選配 `pitch` / `volume`。
- **正則清理與前後對比**：優先讀取 Raw 原文、內建靜態 ReDoS 防護、提供手動即時測試與最近一次朗讀快照對比，並附 AI 正則助手自動沙盒驗證與一鍵套用。
- **防誤清空重設**：支援「恢復預設（保留 URL 與 Token）」與「完全重設（清除全部）」兩種選項，並可於 AI 助手勾選「共用 TTS 網址與 Token」。
