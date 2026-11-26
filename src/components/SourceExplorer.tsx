import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { downloadExtensionZip, EXTENSION_FILES, fetchAllExtensionFiles } from '../utils/extensionFiles';

export function SourceExplorer() {
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [selectedPath, setSelectedPath] = useState<string>(EXTENSION_FILES[0].path);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAllExtensionFiles()
      .then((map) => {
        if (active) {
          setFilesMap(map);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || '讀取插件原始碼失敗');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const currentContent = filesMap[selectedPath] ?? '';
  const currentMeta = EXTENSION_FILES.find((f) => f.path === selectedPath);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      await downloadExtensionZip();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            純原生 ES Module 插件原始碼
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            免打包、免建置、無外部依賴；下載 ZIP 解壓至{' '}
            <code className="font-mono text-xs text-slate-800 dark:text-slate-200">
              public/scripts/extensions/third-party/st-direct-tts/
            </code>{' '}
            即可使用。
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60 whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          {downloading ? '打包中…' : `下載完整插件 ZIP（${EXTENSION_FILES.length} 檔）`}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* File Tree */}
        <nav
          aria-label="插件檔案清單"
          className="rounded-xl border border-slate-200 bg-white p-2 lg:col-span-4 dark:border-slate-800 dark:bg-[#141923]"
        >
          <ul className="space-y-1">
            {EXTENSION_FILES.map((file) => {
              const active = file.path === selectedPath;
              return (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-semibold">{file.path}</div>
                      <div className={`mt-0.5 truncate text-[11px] ${active ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {file.role}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* File Viewer */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8 dark:border-slate-800 dark:bg-[#141923]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <div className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selectedPath}
              </div>
              {currentMeta && (
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{currentMeta.role}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已複製' : '複製檔案'}
            </button>
          </div>

          <pre className="max-h-[68vh] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200">
            {loading ? '載入原始碼中…' : currentContent}
          </pre>
        </div>
      </div>
    </div>
  );
}
