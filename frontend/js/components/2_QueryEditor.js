import uk from '../locales/uk.js';
import en from '../locales/en.js';
import { TabManager } from './editor/TabManager.js';
import { ToolbarActions } from './editor/ToolbarActions.js';

const translations = { uk, en };
let currentLang = localStorage.getItem('ide_lang') || 'uk';

export function initQueryEditor(containerId) {
  const container = document.getElementById(containerId);
  const t = translations[currentLang];
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.includes('Mac');
  const execShortcut = isMac ? '⌘+Enter' : 'Ctrl+Enter';

  container.innerHTML = `
        <div class="panel-header flex justify-between items-center relative z-50 pt-2 px-2 pb-2">
            <span class="text-[10px] uppercase font-bold tracking-wider opacity-70">Query Editor</span>
            <div class="flex items-center gap-2 shrink-0">
                <button id="btn-clear-editor" class="text-lg hover:scale-110 transition-transform drop-shadow-md cursor-pointer" title="${t.qe_clear}">🧹</button>
                <div class="group relative flex items-center gap-1 cursor-help border-x border-[var(--border)] px-3 mx-1">
                    <input type="checkbox" id="god-mode-check" class="scale-90 cursor-pointer accent-red-500">
                    <span id="label-god-mode" class="text-[9px] font-bold text-red-500">${t.qe_god_mode}</span>
                </div>
                <button id="btn-copy-sql" class="text-lg hover:scale-110 transition-transform drop-shadow-md cursor-pointer pr-1" title="${t.qe_copy}">📋</button>
                <button id="btn-import-sql" class="btn-base text-[9px] uppercase font-bold px-3 border-l border-[var(--border)]">${t.qe_import}</button>
                <button id="btn-export-sql" class="btn-base text-[9px] uppercase font-bold px-3">${t.qe_export}</button>
                <div class="pl-2 border-l border-[var(--border)] flex gap-2">
                    <button id="btn-format-sql" class="btn-base text-[9px] px-3 uppercase border border-[var(--border)] hover:bg-[var(--border)]/30 font-bold">✨ ${t.qe_format}</button>
                    <button id="btn-execute" title="${t.qe_execute} (${execShortcut})" class="btn-base text-[10px] px-4 uppercase font-bold text-[var(--text)] hover:text-[var(--accent)] shadow-[0_0_8px_var(--accent)] hover:bg-[var(--border)]/30">${t.qe_execute}</button>
                </div>
            </div>
        </div>

        <div id="editor-tabs" class="h-[34px] bg-black/10 border-b-2 border-[var(--border)] flex items-end px-2 gap-1 overflow-x-auto no-scrollbar shrink-0 select-none"></div>

        <div id="editor-wrapper" class="flex-grow min-h-0 relative"></div>
    `;

  let currentDictionary = [];
  async function loadDbDictionary(db_id) {
    let engine = db_id ? db_id.split('_')[1] || 'sql' : 'sql';
    try {
      const r = await fetch(`./dicts/${engine}.json`);
      if (r.ok) currentDictionary = await r.json();
    } catch (e) { currentDictionary = ["SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE"]; }
  }
  loadDbDictionary(localStorage.getItem('ide_target_db'));
  document.addEventListener('db-changed', (e) => loadDbDictionary(e.detail.id));

  function customSqlHint(cm) {
    const word = cm.getTokenAt(cm.getCursor()).string;
    if (!/^\w+$/.test(word)) return null;
    const list = currentDictionary.filter(i => i.toLowerCase().startsWith(word.toLowerCase()));
    if (list.length === 0) return null;
    return { list, from: CodeMirror.Pos(cm.getCursor().line, cm.getTokenAt(cm.getCursor()).start), to: CodeMirror.Pos(cm.getCursor().line, cm.getTokenAt(cm.getCursor()).end) };
  }

  const editor = CodeMirror(document.getElementById('editor-wrapper'), {
    mode: "sql", lineNumbers: true, lineWrapping: true, theme: "default",
    extraKeys: {
      "Ctrl-Enter": () => document.getElementById('btn-execute').click(),
      "Cmd-Enter": () => document.getElementById('btn-execute').click(),
      "Tab": (cm) => {
        const token = cm.getTokenAt(cm.getCursor());
        if (token.string && /^\w+$/.test(token.string)) cm.showHint({ hint: customSqlHint, completeSingle: true });
        else cm.execCommand("defaultTab");
      }
    }
  });

  let isSwitchingTab = false;

  // 💡 ПРОКИДАЄМО ЛОКАЛІЗАЦІЮ ТРЕТІМ АРГУМЕНТОМ
  const tabManager = new TabManager('editor-tabs', (newContent) => {
    isSwitchingTab = true;
    editor.setValue(newContent);
    editor.clearHistory();
    setTimeout(() => isSwitchingTab = false, 50);
    document.dispatchEvent(new CustomEvent('code-changed', { detail: newContent }));
  }, () => translations[currentLang]);

  tabManager.render();
  editor.setValue(tabManager.getInitialContent());

  let saveTimeout;
  editor.on('change', () => {
    if (isSwitchingTab) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const currentVal = editor.getValue();
      tabManager.updateCurrentContent(currentVal);
      document.dispatchEvent(new CustomEvent('code-changed', { detail: currentVal }));
    }, 300);
  });

  const elements = {
    btnClear: document.getElementById('btn-clear-editor'), btnCopy: document.getElementById('btn-copy-sql'),
    btnImport: document.getElementById('btn-import-sql'), btnExport: document.getElementById('btn-export-sql'),
    btnFormat: document.getElementById('btn-format-sql'), btnExecute: document.getElementById('btn-execute'),
    checkGodMode: document.getElementById('god-mode-check')
  };
  new ToolbarActions(editor, elements, translations, () => currentLang);

  // 💡 ОНОВЛЮЄМО ТАБИ ПРИ ЗМІНІ МОВИ
  document.addEventListener('lang-changed', (e) => {
    currentLang = e.detail;
    const loc = translations[currentLang];
    elements.btnImport.innerText = loc.qe_import;
    elements.btnExport.innerText = loc.qe_export;
    document.getElementById('btn-format-sql').innerHTML = `✨ ${loc.qe_format}`;
    if (!elements.btnExecute.disabled) elements.btnExecute.innerText = loc.qe_execute;
    document.getElementById('label-god-mode').innerText = loc.qe_god_mode;

    tabManager.render(); // 🔄 Перемальовує "Step" на "Крок" миттєво
  });
}
