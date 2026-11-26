/**
 * Honest engineering audit comparing the previous AI's spec against real SillyTavern,
 * TauriTavern (Android), and worker.js (edge-tts-worker) internals.
 */

export interface AuditItem {
  id: string;
  category: 'SillyTavern API' | 'TauriTavern 安卓' | 'worker.js 接口' | '互動與易用性';
  severity: '嚴重缺陷修正' | '實務強化' | '體驗補強';
  previousClaim: string;
  realityFinding: string;
  actualFix: string;
}

export const SPEC_AUDIT_ITEMS: AuditItem[] = [
  {
    id: 'audit-1',
    category: 'SillyTavern API',
    severity: '嚴重缺陷修正',
    previousClaim: '原規格僅籠統提及 `extension_settings`，傳統寫法常直接相對路徑 import `../../../extensions.js`。',
    realityFinding:
      '第三方擴充位於 `extensions/third-party/<name>/`，與內建擴充層級不同，相對路徑 import 在 SillyTavern 與 TauriTavern 極易報 404 失敗。',
    actualFix:
      '全面改用官方零路徑依賴 API：`SillyTavern.getContext().extensionSettings` 與 `saveSettingsDebounced()`，並加上獨立測試回退層。',
  },
  {
    id: 'audit-2',
    category: 'TauriTavern 安卓',
    severity: '嚴重缺陷修正',
    previousClaim: '假設 `getContext().chat[mesId].mes` 永遠與畫面樓層 1:1 對應，未考慮窗口化載入。',
    realityFinding:
      'TauriTavern 為優化手機記憶體採用 Windowed Chat Payload，且提供 `window.__TAURITAVERN__.api.chat`（如 `findLastMessage`）；此外 DOM 回退若直接讀 `.mes_text.textContent` 會誤把展開的 `.mes_reasoning` 思考區塊唸出來。',
    actualFix:
      '實作三層讀取優先序：`context.chat[mesId].mes` → `window.__TAURITAVERN__` 查詢 → 剔除 `.mes_reasoning` 後的 `.mes_text` DOM 後備，並於快照中明確標示實際資料來源。',
  },
  {
    id: 'audit-3',
    category: 'TauriTavern 安卓',
    severity: '嚴重缺陷修正',
    previousClaim: '僅提到複用單例 `<audio>`，未處理面板生命週期與同源 iframe 座標偏差。',
    realityFinding:
      'TauriTavern 曾出現將 `<audio>` 放在抽屜內導致收合後靜音的缺陷；此外 iframe 內的 `event.clientX/Y` 相對於 iframe 視口而非主視窗，直接用來定位選單會飄到左上角。',
    actualFix:
      '單例 `new Audio()` 獨立常駐記憶體（不掛於設定抽屜內），於點擊同步階段以靜音 WAV 解鎖 WebView 自動播放；iframe 事件自動加上 `iframe.getBoundingClientRect()` 位移轉換，並用 `WeakSet` 防重複綁定與 `try/catch` 隔離跨源 iframe。',
  },
  {
    id: 'audit-4',
    category: 'worker.js 接口',
    severity: '實務強化',
    previousClaim: '完全忽略 `worker.js` 內建的 `/v1/voices`、擴展參數 `pitch`/`volume` 及 `opus` 單段 4KB 上限。',
    realityFinding:
      '檢視附檔 `worker.js` 可見：支援免登入或 Bearer 存取 `GET /v1/voices?locale=`、`tts-1-hd` 輸出 96kbps、`pitch`/`volume` 選填欄位，且 `opus/webm` 在超過 4096 bytes 時會回傳 HTTP 400 `input_too_long_for_format`。',
    actualFix:
      '內建「載入伺服器音色」直連 `/v1/voices`（附語言篩選與離線常用音色清單），支援選配傳送 `pitch`/`volume`（預設關閉以相容嚴格 OpenAI 伺服器），選用 `opus` + 整則模式時主動顯示明確警告。',
  },
  {
    id: 'audit-5',
    category: '互動與易用性',
    severity: '體驗補強',
    previousClaim: 'TTS 與 LLM 僅提供單組網址／Token 欄位，播放控制使用佔位底條，且未規劃保留連線設定的局部重設。',
    realityFinding:
      'TTS 與 LLM API 來源互不共用，且使用者常需在多個 TTS 服務或多個 LLM 模型間切換；手機端底部長條也容易遮擋聊天輸入框，而直接依賴 SillyTavern `--active` 變數會呈現刺眼亮綠色。',
    actualFix:
      'TTS 與 LLM 各自建立獨立多方案管理（下拉秒切 + 行內新增／改名／刪除），播放控制改為可拖曳貼邊懸浮球（輕觸暫停／繼續／解鎖播放，角落 × 或長按停止），移除亮綠主題改採暗色柔靛藍配色，並保留雙模式重設。',
  },
  {
    id: 'audit-6',
    category: '互動與易用性',
    severity: '嚴重缺陷修正',
    previousClaim: '原規格要求雙擊事件中只要 `window.getSelection().toString()` 非空就不彈出選單。',
    realityFinding:
      '實機瀏覽器驗證發現：桌面端在文字上觸發 `dblclick` 時，瀏覽器會先於第二次 `mousedown` 自動反白游標下的詞彙，導致 `dblclick` 觸發當下 `getSelection()` 永遠非空，直接封死文字區雙擊！',
    actualFix:
      '桌面端改為追蹤拖曳反白意圖（區分使用者拖曳選字與雙擊自動選詞），觸發選單時自動清除意外單詞反白；手機端 `touchend` 雙擊則維持完整的選取文字防誤觸檢查。',
  },
  {
    id: 'audit-7',
    category: '互動與易用性',
    severity: '實務強化',
    previousClaim: '要求「防 ReDoS 凍結瀏覽器」，但未說明純前端無法中斷已卡死的同步 `String.replace`。',
    realityFinding:
      '瀏覽器主執行緒無法靠 `try/catch` 中斷已進入指數回溯的同步正則，唯一有效防線是執行前靜態 AST/結構掃描直接攔截危險模式。',
    actualFix:
      '實作執行前靜態 ReDoS 檢測（巢狀量詞 `(a+)+`、重疊分支量詞、相鄰 `.*.*`、量詞反向引用與長度上限），危險規則直接於規則列顯示紅色攔截提示並跳過執行，確保瀏覽器永不凍結。',
  },
];
