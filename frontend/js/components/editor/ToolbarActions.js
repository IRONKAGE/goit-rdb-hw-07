import { writeLog } from '../5_ConsoleLogger.js';
import config from '../../config.js';

export class ToolbarActions {
  constructor(editorInstance, elements, translations, getLangStr) {
    this.editor = editorInstance;
    this.elements = elements;
    this.tMap = translations;
    this.getLang = getLangStr;

    this.bindEvents();
  }

  get t() { return this.tMap[this.getLang()]; }

  bindEvents() {
    this.elements.btnClear.addEventListener('click', () => {
      this.editor.setValue('');
      writeLog(this.t.log_cleared || 'Редактор очищено.', "text-[var(--log-text)] italic opacity-70");
    });

    this.elements.btnCopy.addEventListener('click', () => {
      const sql = this.editor.getValue().trim();
      if (!sql) return;
      navigator.clipboard.writeText(sql);
      writeLog(this.t.log_copied, "text-[var(--accent)] italic");
    });

    this.elements.btnFormat.addEventListener('click', () => this.formatCode());
    this.elements.btnImport.addEventListener('click', () => this.importFile());
    this.elements.btnExport.addEventListener('click', () => this.exportFile());
    this.elements.btnExecute.addEventListener('click', () => this.executeCode());
  }

  formatCode() {
    let sql = this.editor.getValue();
    if (!sql.trim()) return;

    if (typeof window.sqlFormatter === 'undefined') {
      return writeLog("> Помилка: Бібліотека sqlFormatter не завантажена. Перевірте libs/", "text-red-500 font-bold");
    }

    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    let engine = 'sql';
    const dialectMap = { 'mysql': 'mysql', 'postgres': 'postgresql', 'mssql': 'tsql', 'oracle': 'plsql' };

    if (db_id) {
      const parts = db_id.split('_');
      if (parts.length > 1 && dialectMap[parts[1]]) engine = parts[1];
    }

    try {
      const formatted = window.sqlFormatter.format(sql, { language: dialectMap[engine] || 'sql', keywordCase: 'upper', linesBetweenQueries: 1 });
      this.editor.setValue(formatted.replace(/--\s*STAND_META_ENGINE:/gi, '-- STAND_META_ENGINE:'));
      writeLog(`${this.t.log_formatted}${engine.toUpperCase()}]`, "text-[var(--accent)] italic");
    } catch (error) {
      writeLog(`> Помилка форматування: перевірте синтаксис SQL`, "text-red-500 font-bold");
    }
  }

  importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql,.txt,.psql,.tsql,.plsql,.prc';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (r) => {
        this.editor.setValue(r.target.result);
        writeLog(`${this.t.log_imported}${file.name}`, "text-[var(--accent)] font-bold");
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async exportFile() {
    const sql = this.editor.getValue().trim();
    if (!sql) return writeLog(this.t.qe_empty, "text-yellow-500 font-bold");

    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    let engine = db_id ? db_id.split('_')[1] || 'sql' : 'sql';

    let defaultExt = engine === 'mssql' ? 'tsql' : engine === 'postgres' ? 'psql' : 'sql';
    if (engine === 'oracle' && /CREATE\s+(OR\s+REPLACE\s+)?PROCEDURE/i.test(sql)) defaultExt = 'prc';

    const fileName = `query_${engine}_${Date.now()}`;

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${fileName}.${defaultExt}`,
          types: [
            { description: 'SQL Script', accept: { 'application/sql': ['.sql'] } },
            { description: 'PostgreSQL Script', accept: { 'application/x-sql': ['.psql'] } },
            { description: 'T-SQL Script', accept: { 'application/x-tsql': ['.tsql'] } },
            { description: 'Oracle PL/SQL', accept: { 'application/x-plsql': ['.plsql'] } },
            { description: 'Oracle Procedure', accept: { 'application/x-prc': ['.prc'] } },
            { description: 'Text', accept: { 'text/plain': ['.txt'] } }
          ],
        });
        const writable = await handle.createWritable(); await writable.write(sql); await writable.close();
        writeLog(this.t.log_exported, "text-[var(--accent)] font-bold");
      } else {
        const blob = new Blob([sql], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileName}.${defaultExt}`; a.click();
        URL.revokeObjectURL(url);
        writeLog(`${this.t.log_exported_ext}.${defaultExt}`, "text-[var(--accent)] font-bold");
      }
    } catch (e) {
      if (e.name !== 'AbortError') writeLog(`${this.t.log_export_fail}${e.message}`, "text-red-500 font-bold");
    }
  }

  // Функція для очищення SQL від коментарів перед відправкою
  sanitizeSql(sql) {
    return sql
      // Видаляємо багаторядкові коментарі /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Видаляємо однорядкові коментарі -- ...
      .replace(/--.*$/gm, '')
      // Прибираємо зайві порожні рядки
      .replace(/^\s*[\r\n]/gm, '')
      .trim();
  }

  async executeCode() {
    let rawSql = this.editor.getValue().trim();
    let sql = this.sanitizeSql(rawSql); // Очищаємо від коментарів

    const db_id = document.getElementById('server-select')?.value || localStorage.getItem('ide_target_db');
    const isGodMode = this.elements.checkGodMode.checked;
    const activeSchema = localStorage.getItem('ide_target_schema');

    if (!sql) {
      // Якщо після очищення залишилася порожнеча (були самі коментарі)
      return writeLog("Запит порожній або містить лише коментарі.", "text-yellow-500 font-bold");
    }

    // Якщо вибрано схему і це MySQL — непомітно додаємо USE
    if (activeSchema && db_id && db_id.includes('mysql')) {
      sql = `USE \`${activeSchema}\`;\n` + sql;
    }

    if (!db_id) return writeLog(this.t.qe_no_db, "text-red-500 font-bold");

    if (isGodMode) {
      const engine = db_id.split('_')[1] || 'sql';
      if (engine !== 'oracle') {
        const originalSql = sql;
        sql = sql.replace(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)([a-zA-Z0-9_]+)/gi, (m, t) => `DROP TABLE IF EXISTS ${t};\n${m}`);
        if (originalSql !== sql) writeLog("> [GOD MODE] Drop table applied.", "text-[var(--accent)] italic opacity-70"); // Можна додати в словник
      }
    }

    this.elements.btnExecute.disabled = true;
    this.elements.btnExecute.innerText = this.t.qe_executing;
    if (window.gsap) gsap.to("#anim-overlay", { opacity: 0.15, duration: 0.1, yoyo: true, repeat: 1 });

    writeLog(`> ${this.t.qe_execute} ${isGodMode ? '[GOD MODE]' : ''}...`, "text-[var(--text)]");

    try {
      const r = await fetch(`${config.API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, db_id, god_mode: isGodMode })
      });

      // БЕЗПЕЧНИЙ ПАРСИНГ ВІДПОВІДІ
      let data;
      try {
        data = await r.json();
      } catch (parseError) {
        throw new Error("Некоректна відповідь від сервера (не JSON)");
      }

      if (!r.ok) {
        // Якщо це FastAPI HTTPException, він лежить у data.detail
        throw new Error(data.detail || data.error || "Server Error");
      }

      document.dispatchEvent(new CustomEvent('data-ready', { detail: data }));
      writeLog(`> ${this.t.qe_success} ${data.rows ? data.rows.length : 0}`, "text-[var(--accent)] font-bold");

    } catch (e) {
      let errorMsg = e.message || "Unknown Error";
      // Очищення трейсбеків Python для гарного виводу
      if (errorMsg.includes('[SQL:')) errorMsg = errorMsg.split('[SQL:')[0];
      if (errorMsg.includes('(Background')) errorMsg = errorMsg.split('(Background')[0];

      writeLog(`${this.t.qe_error} ${errorMsg.trim()}`, "text-red-500 font-bold");
    } finally {
      this.elements.btnExecute.disabled = false;
      this.elements.btnExecute.innerText = this.t.qe_execute;
    }
  }
}
