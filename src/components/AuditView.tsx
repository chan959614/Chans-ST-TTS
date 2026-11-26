import { SPEC_AUDIT_ITEMS } from '../data/specAudit';

export function AuditView() {
  return (
    <div className="mx-auto max-w-[1160px] px-4 py-6 sm:px-6">
      <div className="mb-6 max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ textWrap: 'balance' }}>
          原 AI 規格審計與實務修訂清單
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          以下對照上游 SillyTavern 擴充官方規格、Darkatse/TauriTavern（安卓 WebView 與視窗化聊天架構）及附檔{' '}
          <code className="font-mono text-xs text-slate-800 dark:text-slate-200">worker.js</code>{' '}
          真實程式碼，逐項核查原規格中的潛在幻覺、相容性盲點與操作摩擦，並已直接落實於可下載的純原生 ES Module 插件中。
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#141923]">
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {SPEC_AUDIT_ITEMS.map((item, idx) => (
            <div key={item.id} className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono tabular-nums">0{idx + 1}.</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{item.category}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    item.severity === '嚴重缺陷修正'
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : item.severity === '實務強化'
                        ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : 'font-semibold text-blue-600 dark:text-blue-400'
                  }
                >
                  {item.severity}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">原規格描述／盲點</div>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{item.previousClaim}</p>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">實際環境查證結果</div>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{item.realityFinding}</p>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">本次實作修訂方案</div>
                  <p className="text-sm leading-relaxed text-slate-900 dark:text-slate-100">{item.actualFix}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* worker.js verified contract summary */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#141923]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          附檔 worker.js（edge-tts-worker）實測對接摘要
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">POST /v1/audio/speech</div>
            <div className="text-slate-800 dark:text-slate-200">
              接收 <code className="font-mono text-xs">model / input / voice / speed / response_format</code>，並支援選填{' '}
              <code className="font-mono text-xs">pitch / volume</code>。
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">GET /v1/voices?locale=</div>
            <div className="text-slate-800 dark:text-slate-200">
              回傳完整微軟 Edge 神經音色與 OpenAI 別名表，插件「載入伺服器音色」按鈕直接對接此端點。
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">opus / webm 限制</div>
            <div className="text-slate-800 dark:text-slate-200">
              Worker 僅允許單段 ≤4096 bytes；長文務必使用預設 <code className="font-mono text-xs">mp3</code> 或按句分段模式。
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">CORS 與 Bearer Auth</div>
            <div className="text-slate-800 dark:text-slate-200">
              已回傳 <code className="font-mono text-xs">Access-Control-Allow-Origin: *</code>，前端純 fetch 直連無須額外中轉。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
