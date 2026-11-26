# ST Direct TTS — SillyTavern / TauriTavern 第三方語音直讀插件

純前端原生 ES Module 實作（免打包、免混淆、免額外後端），直接對接 OpenAI 相容 `/v1/audio/speech` 接口（完美相容 Cloudflare `edge-tts-worker`）。

## 安裝方式
1. 將整個資料夾放至 SillyTavern 的 `public/scripts/extensions/third-party/st-direct-tts/`（或於 TauriTavern 擴充管理以 Git 網址安裝）。
2. 重新整理後，於「擴充功能（Extensions）」抽屜展開 **ST Direct TTS** 設定面板。

## 核心使用流程
- **雙擊任一樓層訊息**（文字區、空白留白處或同源內嵌 iframe 皆可）彈出 2 項目選單：
  - **朗讀**：依目前啟用的正則清洗後直接合成播放（命中記憶體快取時秒播）。
  - **重製朗讀**：精準釋放該樓層 Blob URL 快取並強制重新請求 TTS 從頭播放。
- **與 Edge TTS Worker（`worker.js`）無縫對接**：
  - 貼上 Worker 根網址、`/v1` 或完整 `/v1/audio/speech` 皆自動正規化。
  - 點擊「從伺服器載入音色」直接呼叫 `/v1/voices` 列出所有微軟神經音色。
  - 支援 `mp3` 與 `opus`（長文建議使用 `mp3`），並可選擇啟用 `pitch` / `volume` 擴展參數。
- **防誤清空重設**：提供「恢復預設（保留 URL 與 Token）」與「完全重設（清除全部）」兩種選項。
