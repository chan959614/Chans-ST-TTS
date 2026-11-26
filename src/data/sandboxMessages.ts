/**
 * Deterministic SillyTavern / TauriTavern chat fixture messages for testing:
 * - Raw text containing hidden <think>, <status>, HTML comments, and <content> wrappers
 * - Rendered DOM text (simulating SillyTavern hiding <think> in collapsed reasoning box)
 * - Same-origin embedded iframe status card inside a message floor
 */

export interface SandboxChatMessage {
  mesid: number;
  name: string;
  is_user: boolean;
  is_system?: boolean;
  timestamp: string;
  /** Raw text stored in SillyTavern.getContext().chat[mesid].mes */
  mes: string;
  /** Simplified rendered paragraphs shown in .mes_text */
  renderedParagraphs: string[];
  /** Optional hidden reasoning block (to prove Raw priority vs DOM fallback) */
  reasoningPreview?: string;
  /** Optional same-origin iframe HTML to verify iframe double-click coordinate translation */
  iframeHtml?: string;
}

export const INITIAL_SANDBOX_CHAT: SandboxChatMessage[] = [
  {
    mesid: 0,
    name: '林知夏',
    is_user: false,
    timestamp: '21:04',
    reasoningPreview: '先確認雨勢與火車站的氛圍，保持冷靜內斂的口吻，不要主動揭露信封內容。',
    mes: `<think>先確認雨勢與火車站的氛圍，保持冷靜內斂的口吻，不要主動揭露信封內容。</think>
<!-- scene: rainy_station_platform_3 -->
月台上的廣播剛唸完最後一班區間車的誤點通知，細雨斜斜打在遮雨棚邊緣。

「你還是來了。」她把傘收起一半，指尖輕輕摩挲著牛皮紙信封的折角，「我以為你會把那張字條直接扔進垃圾桶。」`,
    renderedParagraphs: [
      '月台上的廣播剛唸完最後一班區間車的誤點通知，細雨斜斜打在遮雨棚邊緣。',
      '「你還是來了。」她把傘收起一半，指尖輕輕摩挲著牛皮紙信封的折角，「我以為你會把那張字條直接扔進垃圾桶。」',
    ],
  },
  {
    mesid: 1,
    name: '你',
    is_user: true,
    timestamp: '21:05',
    mes: '嗯。',
    renderedParagraphs: ['嗯。'],
  },
  {
    mesid: 2,
    name: '林知夏',
    is_user: false,
    timestamp: '21:06',
    reasoningPreview: '角色將鑰匙與舊地圖交給使用者，並在底部附帶 HTML 狀態卡片與 <content> 正文標籤。',
    mes: `<thinking>角色將鑰匙與舊地圖交給使用者，並在底部附帶 HTML 狀態卡片與 <content> 正文標籤。</thinking>
<content>她微微點頭，從大衣口袋裡取出一把帶著銅鏽的小鑰匙，放進你掌心。

「檔案室的鐵門在午夜後只會留一道縫。」她壓低聲音，目光越過你肩頭望向空蕩的驗票口，「別開手電筒，裡面的巡邏燈每三分鐘掃過一次。如果聽到金屬碰撞聲，就立刻退回樓梯間，聽清楚了嗎？」</content>
<status>
地點：舊城南站第三月台
好感度：68 (+4)
物品更新：檔案室銅鑰匙 ×1
</status>
<!-- hud_end -->`,
    renderedParagraphs: [
      '她微微點頭，從大衣口袋裡取出一把帶著銅鏽的小鑰匙，放進你掌心。',
      '「檔案室的鐵門在午夜後只會留一道縫。」她壓低聲音，目光越過你肩頭望向空蕩的驗票口，「別開手電筒，裡面的巡邏燈每三分鐘掃過一次。如果聽到金屬碰撞聲，就立刻退回樓梯間，聽清楚了嗎？」',
    ],
    iframeHtml: `<!doctype html><html><head><style>
      body{margin:0;padding:10px 12px;font:12px/1.5 system-ui,sans-serif;background:#1a2232;color:#cbd5e1;cursor:pointer;user-select:none;}
      .row{display:flex;justify-content:space-between;gap:8px;}
      .k{color:#94a3b8}.v{color:#f1f5f9;font-weight:600}
    </style></head><body>
      <div class="row"><span class="k">內嵌同源 iframe 狀態卡（雙擊此處亦可觸發選單）</span><span class="v">舊城南站 · 21:06</span></div>
      <div class="row" style="margin-top:4px"><span class="k">持有物</span><span class="v">檔案室銅鑰匙 ×1</span></div>
    </body></html>`,
  },
];
