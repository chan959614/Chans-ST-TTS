import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { AuditView } from './components/AuditView';
import { ExtensionSandbox } from './components/ExtensionSandbox';
import { SourceExplorer } from './components/SourceExplorer';
import { downloadExtensionZip } from './utils/extensionFiles';

type WorkspaceTab = 'sandbox' | 'audit' | 'source';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sandbox');
  const [isDark, setIsDark] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      document.body.className = 'bg-[#0e1117] text-[#e6eaf2] antialiased selection:bg-[#3b82f6]/30';
    } else {
      root.classList.remove('dark');
      document.body.className = 'bg-[#f6f7f9] text-[#1c2230] antialiased selection:bg-[#2563eb]/20';
    }
  }, [isDark]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadExtensionZip();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#1c2230] dark:bg-[#0e1117] dark:text-[#e6eaf2]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#11151d]/95">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-2 px-3 py-3 sm:gap-6 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            className="shrink-0 whitespace-nowrap text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-slate-100"
          >
            ST Direct TTS
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav aria-label="主要導覽" className="flex items-center gap-3 text-xs font-medium sm:gap-7 sm:text-sm">
            {(
              [
                { id: 'sandbox', label: '即時沙盒' },
                { id: 'audit', label: '規格審計' },
                { id: 'source', label: '原始碼匯出' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap border-b-2 py-1 transition-colors ${
                    active
                      ? 'border-blue-600 text-slate-900 dark:border-blue-500 dark:text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60 sm:px-3.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{downloading ? '打包中…' : '下載插件 ZIP'}</span>
              <span className="sm:hidden">{downloading ? '打包…' : 'ZIP'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="pb-24">
        {activeTab === 'sandbox' && (
          <ExtensionSandbox isDark={isDark} onToggleTheme={() => setIsDark((d) => !d)} />
        )}
        {activeTab === 'audit' && <AuditView />}
        {activeTab === 'source' && <SourceExplorer />}
      </main>
    </div>
  );
}
