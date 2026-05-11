import { writeLog } from './5_ConsoleLogger.js';
import config from '../config.js';
import uk from '../locales/uk.js';
import en from '../locales/en.js';

const translations = { uk, en };
let currentLang = localStorage.getItem('ide_lang') || 'uk';

export function initDataGrid(containerId) {
  const container = document.getElementById(containerId);
  const t = translations[currentLang] || translations['uk'];

  container.innerHTML = `
        <div class="panel-header flex items-center gap-3 relative z-40 w-full overflow-hidden pr-1 min-h-[36px]">
            <span id="lbl-live-output" class="text-[10px] uppercase font-bold tracking-wider opacity-70 whitespace-nowrap flex-shrink-0">
                ${t.dg_live_output || 'Live Output:'}
            </span>

            <div class="relative group flex-grow min-w-[50px]">
                <select id="grid-table-select" class="appearance-none bg-black/30 border border-[var(--border)] text-[var(--accent)] font-bold text-[10px] pl-2 pr-7 py-1 rounded cursor-pointer outline-none hover:border-[var(--accent)] transition-colors focus:ring-1 focus:ring-[var(--accent)] shadow-inner w-full text-ellipsis overflow-hidden whitespace-nowrap">
                    <option value="" disabled selected>${t.dg_loading || '⏳ Завантаження...'}</option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-[var(--accent)] bg-[var(--panel)] border-l border-[var(--border)] rounded-r opacity-90">
                    <svg class="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>

            <input type="checkbox" id="export-mode-check" checked title="${t.dg_export_tip || 'Експорт'}" class="flex-shrink-0 scale-90 cursor-help accent-[var(--accent)] bg-black/30 border-[var(--border)] transition-all disabled:opacity-30 disabled:cursor-not-allowed">

            <div class="flex gap-2 items-center border-l border-[var(--border)] pl-3 flex-shrink-0">
                <button id="btn-save-data" class="btn-base text-[9px] uppercase font-bold px-3 transition-colors">
                    ${t.dg_save || '💾 Зберегти дані'}
                </button>
                <button id="btn-open-data" class="btn-base text-[9px] uppercase font-bold px-3 transition-colors">
                    ${t.dg_open || '📂 Відкрити дані'}
                </button>
            </div>
        </div>
        <div id="table-container" class="flex-grow overflow-auto p-2 bg-black/10 relative">
            <table class="w-full text-left text-[11px] border-collapse">
                <thead id="t-head" class="sticky top-0 bg-[var(--panel)] shadow-sm z-10"></thead>
                <tbody id="t-body"></tbody>
            </table>
        </div>

        <!-- ПАГІНАЦІЯ -->
        <div id="grid-pagination" class="hidden panel-header flex justify-between items-center bg-black/20 border-t border-[var(--border)] px-4 z-30 relative min-h-[36px] select-none">

            <!-- Зліва: Всього стовпчиків -->
            <div class="flex-1 flex justify-start">
                <span id="col-info" class="text-[10px] text-[var(--log-text)] font-bold text-center whitespace-pre-line"></span>
            </div>

            <!-- По центру: Контроли -->
            <div class="flex items-center justify-center flex-shrink-0">
                <button id="btn-prev-page" class="btn-base px-3 py-1 text-[9px] uppercase opacity-50 cursor-not-allowed transition-all w-[110px] text-center"></button>
                <input type="number" id="page-input" class="w-[50px] text-center text-[10px] font-bold mx-2 py-1 bg-black/40 border border-[var(--border)] rounded text-[var(--accent)] outline-none focus:border-[var(--accent)] transition-colors [&::-webkit-inner-spin-button]:appearance-none" min="1">
                <button id="btn-next-page" class="btn-base px-3 py-1 text-[9px] uppercase opacity-50 cursor-not-allowed transition-all w-[110px] text-center"></button>
            </div>

            <!-- Справа: Всього записів -->
            <div class="flex-1 flex justify-end">
                <span id="page-info" class="text-[10px] text-[var(--log-text)] font-bold text-center whitespace-pre-line"></span>
            </div>
        </div>
    `;

  const selectObj = document.getElementById('grid-table-select');
  const btnOpen = document.getElementById('btn-open-data');
  const btnSave = document.getElementById('btn-save-data');
  const exportCheck = document.getElementById('export-mode-check');

  // --- СИСТЕМА УПРАВЛІННЯ СТАНОМ (SESSION STORAGE) ---
  let currentDbData = null;
  let currentPage = 1;
  const PAGE_SIZE = 100;

  let session = {
    view: 'db', // 'db', 'query', 'preview'
    tableName: '',
    fileName: '',
    isSqlFile: false,
    rawSql: '',
    queryData: null,
    previewData: null
  };

  try {
    const cached = sessionStorage.getItem('ide_grid_store');
    if (cached) session = { ...session, ...JSON.parse(cached) };
  } catch (e) { /* Ігноруємо помилки читання */ }

  function saveSession() {
    try {
      sessionStorage.setItem('ide_grid_store', JSON.stringify(session));
    } catch (e) {
      writeLog("> Інфо: Поточний масив даних завеликий для кешу. Він не переживе перезавантаження сторінки (F5), але працюватиме зараз.", "text-yellow-500 text-[10px]");
    }
  }

  function getActiveData() {
    if (session.view === 'query') return session.queryData;
    if (session.view === 'preview') return session.previewData;
    return currentDbData;
  }

  // --- ЛОКАЛІЗАЦІЯ ТА UI ---
  document.addEventListener('lang-changed', (e) => {
    currentLang = e.detail;
    updateUI();
    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    if (db_id) fetchTableList(db_id);
  });

  function updateUI() {
    const loc = translations[currentLang] || translations['uk'];
    document.getElementById('lbl-live-output').innerText = loc.dg_live_output || 'Live Output:';
    btnOpen.innerHTML = loc.dg_open || '📂 Відкрити дані';
    exportCheck.title = loc.dg_export_tip || 'Експорт';
    document.getElementById('btn-prev-page').innerText = loc.dg_btn_prev || '◀ Назад';
    document.getElementById('btn-next-page').innerText = loc.dg_btn_next || 'Вперед ▶';

    if (session.view === 'query') {
      exportCheck.disabled = true; exportCheck.checked = true;
      btnSave.innerHTML = loc.dg_save || '💾 Зберегти дані';
      btnSave.className = btnSave.className.replace('text-[var(--accent)]', 'text-[var(--text)]');
    } else if (session.view === 'preview') {
      exportCheck.disabled = true; exportCheck.checked = true;
      btnSave.innerHTML = loc.dg_import_db || '🚀 Імпортувати в БД';
      btnSave.classList.add('text-[var(--accent)]');
    } else {
      exportCheck.disabled = false;
      btnSave.innerHTML = loc.dg_save || '💾 Зберегти дані';
      btnSave.className = btnSave.className.replace('text-[var(--accent)]', 'text-[var(--text)]');
    }

    updatePaginationUI();
  }

  // --- UI: МОДАЛКА НАЛАШТУВАНЬ ІМПОРТУ ---
  function askImportSettings(defaultTable, existingTables, loc) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/90";
      overlay.innerHTML = `
              <div class="bg-[var(--panel)] border border-[var(--border)] p-5 rounded shadow-[0_0_30px_rgba(0,0,0,0.8)] min-w-[350px] transform scale-95 opacity-0 transition-all duration-200" id="import-settings-box">
                  <div class="text-[var(--accent)] font-bold mb-4 text-lg border-b border-[var(--border)] pb-2">${loc.log_modal_import_title || '⚙️ Налаштування імпорту'}</div>
                  <div class="mb-3">
                      <label class="block text-[10px] uppercase text-[var(--log-text)] font-bold mb-1">${loc.log_modal_target_table || 'Цільова таблиця:'}</label>
                      <input type="text" id="imp-target-table" value="${defaultTable}" class="w-full bg-black/30 border border-[var(--border)] text-[var(--text)] px-3 py-1.5 rounded focus:border-[var(--accent)] outline-none text-sm font-mono">
                  </div>
                  <div class="mb-4 bg-black/20 p-2 rounded border border-[var(--border)]/50">
                      <label class="block text-[10px] uppercase text-[var(--log-text)] font-bold mb-2">${loc.log_modal_mode || 'Режим запису:'}</label>
                      <div class="flex flex-col gap-1.5 text-[11px]">
                          <label class="flex items-center gap-2 cursor-pointer hover:text-[var(--accent)] transition-colors">
                              <input type="radio" name="imp-mode" value="overwrite" checked class="accent-[var(--accent)]">
                              ${loc.log_modal_mode_new || 'Створити нову / Переписати'}
                          </label>
                          <label class="flex items-center gap-2 cursor-pointer hover:text-[var(--accent)] transition-colors">
                              <input type="radio" name="imp-mode" value="append" class="accent-[var(--accent)]">
                              ${loc.log_modal_mode_append || 'Додати дані (Append)'}
                          </label>
                      </div>
                  </div>
                  <div class="mb-5">
                      <label class="block text-[10px] uppercase text-[var(--log-text)] font-bold mb-2">${loc.log_modal_options || 'Опції:'}</label>
                      <div class="flex flex-col gap-2 text-[11px]">
                          <label class="flex items-center gap-2 cursor-pointer hover:text-[var(--accent)] transition-colors">
                              <input type="checkbox" id="imp-ignore" checked class="accent-[var(--accent)]">
                              ${loc.log_modal_ignore_dups || 'Ігнорувати дублікати (INSERT IGNORE)'}
                          </label>
                          <label class="flex items-center gap-2 cursor-pointer hover:text-yellow-500 transition-colors">
                              <input type="checkbox" id="imp-fk" class="accent-yellow-500">
                              ${loc.log_modal_disable_fk || 'Вимкнути перевірку зовнішніх ключів'}
                          </label>
                          <label class="flex items-center gap-2 cursor-pointer hover:text-red-400 transition-colors">
                              <input type="checkbox" id="imp-tx" class="accent-red-400">
                              ${loc.log_modal_transaction || 'Огорнути в транзакцію (BEGIN ... COMMIT)'}
                          </label>
                      </div>
                  </div>
                  <div class="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                      <button id="btn-imp-cancel" class="btn-base px-3 py-1.5 text-[11px] hover:text-red-500">${loc.log_conflict_cancel || '❌ Відмінити'}</button>
                      <button id="btn-imp-next" class="btn-base bg-[var(--accent)]/10 border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white px-4 py-1.5 text-[11px] font-bold shadow-[0_0_10px_var(--accent)]">${loc.log_modal_btn_next || 'Далі ➔'}</button>
                  </div>
              </div>
          `;
      document.body.appendChild(overlay);
      setTimeout(() => document.getElementById('import-settings-box').classList.remove('scale-95', 'opacity-0'), 10);
      const close = (data) => { overlay.remove(); resolve(data); };

      const inputTable = document.getElementById('imp-target-table');
      const radioAppend = document.querySelector('input[value="append"]');
      const radioOverwrite = document.querySelector('input[value="overwrite"]');

      inputTable.addEventListener('input', () => {
        if (existingTables.includes(inputTable.value.trim())) radioAppend.checked = true;
        else radioOverwrite.checked = true;
      });

      document.getElementById('btn-imp-cancel').onclick = () => close(null);
      document.getElementById('btn-imp-next').onclick = () => {
        close({
          table: document.getElementById('imp-target-table').value.trim(),
          mode: document.querySelector('input[name="imp-mode"]:checked').value,
          ignore: document.getElementById('imp-ignore').checked,
          disableFK: document.getElementById('imp-fk').checked,
          useTx: document.getElementById('imp-tx').checked
        });
      };
    });
  }

  // --- UI: МОДАЛКА МАПІНГУ КОЛОНОК ---
  function askColumnMapping(csvCols, dbCols, loc) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/90";
      let mappingRows = csvCols.map((c, idx) => {
        let bestMatch = '';
        const normalizedC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
        dbCols.forEach(dbC => { if (dbC.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedC) bestMatch = dbC; });
        let options = `<option value="">${loc.log_mapping_skip || '-- Пропустити --'}</option>`;
        dbCols.forEach(dbC => { options += `<option value="${dbC}" ${dbC === bestMatch ? 'selected' : ''}>${dbC}</option>`; });
        return `
                  <div class="flex items-center gap-3 mb-2 bg-black/20 p-2 rounded border border-[var(--border)]/30 hover:border-[var(--accent)]/50 transition-colors">
                      <div class="w-1/2 font-mono text-[11px] text-[var(--accent)] truncate" title="${c}">${c}</div>
                      <div class="text-[14px] opacity-50">➔</div>
                      <select class="map-select w-1/2 bg-black/40 border border-[var(--border)] text-[var(--text)] text-[11px] p-1 rounded outline-none focus:border-[var(--accent)]" data-csv-idx="${idx}">
                          ${options}
                      </select>
                  </div>
              `;
      }).join('');

      overlay.innerHTML = `
              <div class="bg-[var(--panel)] border border-[var(--border)] p-5 rounded shadow-[0_0_30px_rgba(0,0,0,0.8)] min-w-[400px] max-w-[600px] max-h-[80vh] flex flex-col transform scale-95 opacity-0 transition-all duration-200" id="mapping-box">
                  <div class="text-[var(--accent)] font-bold mb-2 text-lg">${loc.log_mapping_title || '🔗 Мапінг колонок'}</div>
                  <div class="text-[var(--log-text)] text-[11px] mb-4">${loc.log_mapping_desc || 'Зв\'яжіть колонки з файлу з колонками у базі даних:'}</div>
                  <div class="flex-grow overflow-y-auto pr-2 custom-scrollbar">${mappingRows}</div>
                  <div class="flex justify-end gap-2 pt-4 mt-2 border-t border-[var(--border)]">
                      <button id="btn-map-cancel" class="btn-base px-3 py-1.5 text-[11px] hover:text-red-500">${loc.log_conflict_cancel || '❌ Відмінити'}</button>
                      <button id="btn-map-import" class="btn-base bg-[var(--accent)] hover:bg-[var(--accent)]/80 text-black px-4 py-1.5 text-[11px] font-bold shadow-[0_0_15px_var(--accent)] transition-all">${loc.log_mapping_btn_import || '🚀 Розпочати імпорт'}</button>
                  </div>
              </div>
          `;
      document.body.appendChild(overlay);
      setTimeout(() => document.getElementById('mapping-box').classList.remove('scale-95', 'opacity-0'), 10);
      const close = (data) => { overlay.remove(); resolve(data); };
      document.getElementById('btn-map-cancel').onclick = () => close(null);
      document.getElementById('btn-map-import').onclick = () => {
        const selects = document.querySelectorAll('.map-select');
        const mapping = [];
        selects.forEach(sel => { if (sel.value) mapping.push({ csvIdx: parseInt(sel.getAttribute('data-csv-idx')), dbCol: sel.value }); });
        close(mapping);
      };
    });
  }

  // --- UI: МОДАЛКА КОНФЛІКТІВ ---
  function askConflictAction(tableName, loc) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/90";
      const descHtml = (loc.log_conflict_desc || 'Таблиця {0} вже існує. Що бажаєте зробити?').replace('{0}', `<span class="text-white font-bold text-[14px]">${tableName}</span>`);
      overlay.innerHTML = `
          <div class="bg-[var(--panel)] border border-[var(--border)] p-5 rounded shadow-[0_0_30px_rgba(0,0,0,0.8)] min-w-[320px] transform scale-95 opacity-0 transition-all duration-200" id="conflict-box">
              <div class="text-[var(--accent)] font-bold mb-2 text-lg">${loc.log_conflict_title || '⚠️ Конфлікт імен'}</div>
              <div class="text-[var(--text)] text-[12px] mb-5">${descHtml}</div>
              <div class="flex flex-col gap-2">
                  <button id="btn-modal-overwrite" class="btn-base bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white px-3 py-2 text-[11px] font-bold text-left transition-colors">${loc.log_conflict_overwrite || '🔥 Переписати'}</button>
                  <button id="btn-modal-rename" class="btn-base border border-[var(--border)] px-3 py-2 text-[11px] hover:text-[var(--accent)] text-left transition-colors">${loc.log_conflict_rename || '✏️ Перейменувати'}</button>
                  <button id="btn-modal-cancel" class="btn-base border border-[var(--border)] px-3 py-2 text-[11px] hover:text-gray-300 text-left transition-colors">${loc.log_conflict_cancel || '❌ Відмінити'}</button>
              </div>
          </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => document.getElementById('conflict-box').classList.remove('scale-95', 'opacity-0'), 10);
      const close = (action) => { overlay.remove(); resolve(action); };
      document.getElementById('btn-modal-overwrite').onclick = () => close('overwrite');
      document.getElementById('btn-modal-rename').onclick = () => close('rename');
      document.getElementById('btn-modal-cancel').onclick = () => close('cancel');
    });
  }

  // --- ІНЖЕНЕРНІ ФУНКЦІЇ ---
  function sanitizeData(parsedData, loc) {
    if (!parsedData || !parsedData.columns) return null;
    let cols = parsedData.columns; let rows = parsedData.rows;
    let emptyColsCount = 0; let emptyRowsCount = 0;

    for (let c = cols.length - 1; c >= 0; c--) {
      if (!cols[c] || cols[c].trim() === '') {
        const hasData = rows.some(r => r[c] !== null && r[c] !== '');
        if (!hasData) { cols.splice(c, 1); rows.forEach(r => r.splice(c, 1)); emptyColsCount++; }
        else cols[c] = `column_${c + 1}`;
      }
    }
    while (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      if (lastRow.every(v => v === null || v === '')) { rows.pop(); emptyRowsCount++; }
      else break;
    }
    if (emptyColsCount > 0 || emptyRowsCount > 0) writeLog((loc.log_garbage_cleaned || '> Очищення: видалено порожніх колонок - {0}, рядків - {1}').replace('{0}', emptyColsCount).replace('{1}', emptyRowsCount), "text-yellow-500 italic text-[10px]");
    return { columns: cols, rows: rows };
  }

  function inferColumnTypes(cols, rows, engine, loc) {
    const types = {};
    cols.forEach((c, cIdx) => {
      let isInt = true, isFloat = true, isBool = true, maxLen = 0;
      const sampleSize = Math.min(rows.length, 200);
      for (let r = 0; r < sampleSize; r++) {
        const val = rows[r][cIdx];
        if (val === null || val === '') continue;
        const str = String(val).trim();
        maxLen = Math.max(maxLen, str.length);
        if (!/^-?\d+$/.test(str)) isInt = false;
        if (!/^-?\d+(\.\d+)?$/.test(str)) isFloat = false;
        if (!/^(true|false|1|0)$/i.test(str)) isBool = false;
      }
      let type = 'VARCHAR(255)';
      if (maxLen === 0) type = (engine === 'oracle' ? 'VARCHAR2(255)' : 'VARCHAR(255)');
      else if (isInt && maxLen < 10) type = 'INT';
      else if (isInt && maxLen >= 10) type = 'BIGINT';
      else if (isFloat) type = (engine === 'oracle' ? 'NUMBER' : 'FLOAT');
      else if (isBool) type = (engine === 'postgres' ? 'BOOLEAN' : 'TINYINT(1)');
      else if (maxLen > 255) type = (engine === 'oracle' ? 'CLOB' : 'TEXT');
      else type = (engine === 'oracle' ? `VARCHAR2(${Math.max(255, maxLen + 50)})` : `VARCHAR(${Math.max(255, maxLen + 50)})`);
      types[c] = type;
    });
    return types;
  }

  function escapeIdent(ident, engine) {
    const safeIdent = ident.replace(/[^a-zA-Z0-9_]/g, '_');
    if (engine === 'mysql') return `\`${safeIdent}\``;
    if (engine === 'mssql') return `[${safeIdent}]`;
    return `"${safeIdent}"`;
  }

  function parseCSV(text) {
    const rows = []; let cur = '', inQuotes = false, row = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = !inQuotes; }
      else if (c === ',' && !inQuotes) { row.push(cur.trim()); cur = ''; }
      else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur.trim()); rows.push(row); row = []; cur = '';
      } else { cur += c; }
    }
    if (cur || row.length > 0) { row.push(cur.trim()); rows.push(row); }
    if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
    if (rows.length < 1) return null;
    const columns = rows[0]; const dataRows = rows.slice(1).map(r => r.map(v => v === '' ? null : v));
    return { columns, rows: dataRows };
  }

  function parseJSON(text) {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const columns = Array.from(new Set(arr.flatMap(Object.keys)));
      const rows = arr.map(obj => columns.map(col => obj[col] !== undefined ? obj[col] : null));
      return { columns, rows };
    } catch (e) { return null; }
  }

  function prepareSQLPreview(text) {
    const previewText = text.length > 500 ? text.substring(0, 500) + '...\n\n[ЗАЛИШОК ПРИХОВАНО]' : text;
    return { columns: ['SQL Script Preview'], rows: [[previewText]], rawSql: text };
  }

  // --- ПАГІНАЦІЯ ТА РЕНДЕР ---
  function updatePaginationUI() {
    const loc = translations[currentLang] || translations['uk'];
    const pagContainer = document.getElementById('grid-pagination');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const info = document.getElementById('page-info');
    const colInfo = document.getElementById('col-info'); // <--- Додали лівий span
    const pageInput = document.getElementById('page-input');

    const activeData = getActiveData();

    if (!activeData || !activeData.rows || activeData.rows.length <= PAGE_SIZE) {
      pagContainer.classList.add('hidden');
      return;
    }

    pagContainer.classList.remove('hidden');

    // Рахуємо статистику
    const totalRows = activeData.rows.length;
    const totalCols = activeData.columns ? activeData.columns.length : 0; // <--- Рахуємо колонки
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);

    // Відображення тексту (Симетрія)
    info.innerText = (loc.dg_total_records || 'Всього записів:\n{0}').replace('{0}', totalRows);
    colInfo.innerText = (loc.dg_total_columns || 'Всього стовпчиків:\n{0}').replace('{0}', totalCols); // <--- Виводимо зліва

    // Налаштування інпуту
    pageInput.value = currentPage;
    pageInput.max = totalPages;
    pageInput.title = loc.dg_page_input_title || 'Введіть номер сторінки та натисніть Enter';

    // Динамічний текст кнопок (наступна/попередня сторінка)
    btnPrev.innerText = (loc.dg_btn_prev_to || '◀ Назад до {0}').replace('{0}', Math.max(1, currentPage - 1));
    btnNext.innerText = (loc.dg_btn_next_to || 'Вперед до {0} ▶').replace('{0}', Math.min(totalPages, currentPage + 1));

    btnPrev.disabled = currentPage === 1;
    btnPrev.className = btnPrev.disabled ? btnPrev.className.replace('opacity-100 hover:text-[var(--accent)]', 'opacity-50 cursor-not-allowed') : btnPrev.className.replace('opacity-50 cursor-not-allowed', 'opacity-100 hover:text-[var(--accent)] cursor-pointer');

    btnNext.disabled = currentPage === totalPages;
    btnNext.className = btnNext.disabled ? btnNext.className.replace('opacity-100 hover:text-[var(--accent)]', 'opacity-50 cursor-not-allowed') : btnNext.className.replace('opacity-50 cursor-not-allowed', 'opacity-100 hover:text-[var(--accent)] cursor-pointer');
  }

  function renderGrid(data, resetPage = true) {
    if (resetPage) currentPage = 1;
    const loc = translations[currentLang] || translations['uk'];
    const h = document.getElementById('t-head');
    const b = document.getElementById('t-body');

    if (!data || !data.columns) { h.innerHTML = ""; b.innerHTML = ""; updatePaginationUI(); return; }

    // Додаємо колонку "№" у заголовок
    const rowNumStr = loc.dg_row_num || '№';
    h.innerHTML = `<tr>
        <th class="p-2 border-b border-[var(--border)] text-[var(--log-text)] font-bold w-[40px] text-center bg-[var(--panel)] sticky left-0 z-20">${rowNumStr}</th>
        ${data.columns.map(c => `<th class="p-2 border-b border-[var(--border)] uppercase text-[var(--log-text)] font-bold opacity-80 whitespace-nowrap">${c}</th>`).join('')}
    </tr>`;

    b.innerHTML = "";

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageRows = data.rows.slice(startIndex, startIndex + PAGE_SIZE);

    pageRows.forEach((row, i) => {
      const absoluteIndex = startIndex + i + 1; // Абсолютний номер рядка
      const tr = document.createElement('tr');
      tr.className = "border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors";

      // Додаємо комірку з номером рядка
      let rowHtml = `<td class="p-2 text-[var(--log-text)] text-center opacity-60 text-[9px] font-mono border-r border-[var(--border)]/30 sticky left-0 bg-black/20">${absoluteIndex}</td>`;

      rowHtml += row.map(v => `<td class="p-2 text-[var(--text)] whitespace-nowrap"><div class="${session.isSqlFile ? 'whitespace-pre-wrap font-mono text-[10px]' : ''}">${v !== null ? `<span class="font-bold text-[var(--accent)]">${v}</span>` : '<span class="text-red-500/70 italic text-[9px]">NULL</span>'}</div></td>`).join('');
      tr.innerHTML = rowHtml;
      b.appendChild(tr);
    });

    updatePaginationUI();
  }

  // --- ЛОГІКА ПАГІНАЦІЇ (INPUT & LONG PRESS) ---

  // 1. Швидкий перехід через Input
  const pageInput = document.getElementById('page-input');
  pageInput.addEventListener('change', (e) => {
    const d = getActiveData();
    if (!d) return;
    const totalPages = Math.ceil(d.rows.length / PAGE_SIZE);
    let targetPage = parseInt(e.target.value, 10);

    if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
    if (targetPage > totalPages) targetPage = totalPages;

    currentPage = targetPage;
    pageInput.value = currentPage; // Повертаємо безпечне значення в UI
    renderGrid(d, false);
  });

  // 2. Механізм Long Press (5 секунд) та звичайного кліку
  function setupLongPressPagination(btnId, isPrev) {
    const btn = document.getElementById(btnId);
    let pressTimer = null;
    let isLongPressFired = false;

    const executeJump = () => {
      const d = getActiveData();
      if (!d) return;
      const totalPages = Math.ceil(d.rows.length / PAGE_SIZE);
      currentPage = isPrev ? 1 : totalPages;
      renderGrid(d, false);
    };

    const executeNormal = () => {
      const d = getActiveData();
      if (!d) return;
      const totalPages = Math.ceil(d.rows.length / PAGE_SIZE);
      if (isPrev && currentPage > 1) {
        currentPage--; renderGrid(d, false);
      } else if (!isPrev && currentPage < totalPages) {
        currentPage++; renderGrid(d, false);
      }
    };

    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || btn.disabled) return;
      isLongPressFired = false;

      // Запускаємо таймер на 1333 мс (1.333 секунди)
      pressTimer = setTimeout(() => {
        isLongPressFired = true;
        executeJump();
      }, 1333);
    });

    btn.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || btn.disabled) return;
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      // Якщо відпустили раніше 5 секунд — це звичайний клік
      if (!isLongPressFired) executeNormal();
    });

    btn.addEventListener('mouseleave', () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
  }

  setupLongPressPagination('btn-prev-page', true);
  setupLongPressPagination('btn-next-page', false);

  // --- МЕТА-ЗАПИТ (ДИНАМІЧНИЙ СЕЛЕКТОР) ---
  async function fetchTableList(db_id) {
    if (!db_id) return;
    const loc = translations[currentLang] || translations['uk'];
    let engine = db_id.split('_')[1] || 'sql';
    let metaSql = (engine === 'mysql') ? "SHOW TABLES;" : (engine === 'postgres') ? "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';" : (engine === 'mssql') ? "SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE';" : "SELECT table_name FROM user_tables;";
    try {
      const r = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: metaSql, db_id, god_mode: true }) });
      const data = await r.json();
      let optionsHtml = '';

      if (session.queryData) optionsHtml += `<option value="_query_" ${session.view === 'query' ? 'selected' : ''}>⚡ ${loc.dg_query_result || 'Результат запиту'}</option>`;
      if (session.previewData) optionsHtml += `<option value="_preview_" ${session.view === 'preview' ? 'selected' : ''}>📁 ${loc.dg_local_file || 'Локальний файл: '}${session.fileName}</option>`;
      if (session.view === 'db' && !session.tableName) optionsHtml += `<option value="" disabled selected>${loc.dg_choose_table || 'Оберіть таблицю...'}</option>`;

      if (r.ok && data.rows && data.rows.length > 0) {
        optionsHtml += `<optgroup label="${loc.dg_db_tables || 'Таблиці в БД'}">`;
        data.rows.forEach(row => { optionsHtml += `<option value="${row[0]}" ${session.view === 'db' && session.tableName === row[0] ? 'selected' : ''}>${row[0]}</option>`; });
        optionsHtml += `</optgroup>`;
      } else optionsHtml += `<option value="" disabled>${loc.dg_no_tables || 'Відсутні таблиці'}</option>`;

      selectObj.innerHTML = optionsHtml;
    } catch (e) { selectObj.innerHTML = `<option value="" disabled selected>Помилка завантаження</option>`; }
  }

  // --- СЛУХАЧІ ПОДІЙ ---
  document.addEventListener('data-ready', (e) => {
    session.queryData = e.detail;
    session.view = 'query';
    saveSession();
    updateUI();
    renderGrid(session.queryData);
    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    fetchTableList(db_id);
  });

  document.addEventListener('db-changed', (e) => {
    if (session.view === 'db') {
      session.tableName = '';
      currentDbData = null;
      renderGrid(null);
    }
    saveSession();
    updateUI();
    fetchTableList(e.detail.id);
  });

  const initialDb = localStorage.getItem('ide_target_db');
  if (initialDb) {
    fetchTableList(initialDb).then(() => {
      updateUI();
      if (session.view === 'query' && session.queryData) renderGrid(session.queryData);
      else if (session.view === 'preview' && session.previewData) renderGrid(session.previewData);
      else if (session.view === 'db' && session.tableName) {
        selectObj.value = session.tableName;
        selectObj.dispatchEvent(new Event('change'));
      }
    });
  }

  selectObj.addEventListener('change', async (e) => {
    const val = e.target.value;

    if (val === '_query_') {
      session.view = 'query'; saveSession(); updateUI(); renderGrid(session.queryData); return;
    }
    if (val === '_preview_') {
      session.view = 'preview'; saveSession(); updateUI(); renderGrid(session.previewData); return;
    }

    session.view = 'db';
    session.tableName = val;
    saveSession();
    updateUI();

    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    if (!db_id) return;

    writeLog(`> Отримання даних з таблиці: ${val}...`, "text-[var(--text)]");
    try {
      const r = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: `SELECT * FROM ${val};`, db_id, god_mode: true }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || "Server Error");
      currentDbData = data;
      renderGrid(currentDbData);
      writeLog(`> Успішно завантажено (${data.rows.length} рядків)`, "text-[var(--accent)] font-bold");
    } catch (err) { writeLog(`[Помилка] Не вдалося прочитати таблицю: ${err.message}`, "text-red-500 font-bold"); }
  });

  // --- ДИСПЕТЧЕР КНОПКИ COMMIT (ЕКСПОРТ / ІМПОРТ) ---
  btnSave.addEventListener('click', async () => {
    const loc = translations[currentLang] || translations['uk'];
    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    const btnExecEditor = document.getElementById('btn-execute');
    if (!db_id) return writeLog("> Помилка: Не обрано базу даних.", "text-red-500 font-bold");

    // 🚀 СЦЕНАРІЙ 3: ІМПОРТ ЛОКАЛЬНИХ ДАНИХ У БАЗУ
    if (session.view === 'preview') {
      let engine = db_id.split('_')[1] || 'sql';
      const activeData = session.previewData;

      if (session.isSqlFile) {
        writeLog(`> Відправка SQL-скрипта на сервер...`, "text-[var(--text)]");
        try {
          if (btnExecEditor) btnExecEditor.disabled = true;
          const r = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: session.rawSql, db_id, god_mode: true }) });
          if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
          writeLog(`${loc.log_import_success || '> Дані успішно імпортовано: '}БД.`, "text-[var(--accent)] font-bold");
          fetchTableList(db_id);
        } catch (e) { writeLog(`> Помилка виконання: ${e.message}`, "text-red-500 font-bold"); }
        finally { if (btnExecEditor) btnExecEditor.disabled = false; }
        return;
      }

      const defaultTableName = session.fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_]/g, '_');
      const existingTables = Array.from(selectObj.options).filter(o => o.parentElement && o.parentElement.tagName === 'OPTGROUP').map(o => o.value);

      const settings = await askImportSettings(defaultTableName, existingTables, loc);
      if (!settings) return writeLog(loc.log_import_cancel || '> Імпорт скасовано.', "text-yellow-500 font-bold");

      const { table: targetTable, mode, ignore, disableFK, useTx } = settings;
      if (!targetTable) return writeLog(loc.log_import_cancel || '> Імпорт скасовано.', "text-yellow-500 font-bold");

      const safeTargetTable = escapeIdent(targetTable, engine);
      let setupSql = '';
      let actualMapping = null;

      if (mode === 'append' && existingTables.includes(targetTable)) {
        writeLog(`> Отримання структури існуючої таблиці ${targetTable}...`, "text-[var(--text)] text-[10px]");
        try {
          const rMeta = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: `SELECT * FROM ${safeTargetTable} LIMIT 0;`, db_id, god_mode: true }) });
          const metaData = await rMeta.json();
          if (rMeta.ok && metaData.columns) {
            actualMapping = await askColumnMapping(activeData.columns, metaData.columns, loc);
            if (!actualMapping) return writeLog(loc.log_import_cancel || '> Імпорт скасовано.', "text-yellow-500 font-bold");
            if (actualMapping.length === 0) return writeLog("> Помилка: Не вибрано жодної колонки для мапінгу.", "text-red-500 font-bold");
          }
        } catch (e) { writeLog("> Не вдалося отримати структуру таблиці. Використовуються оригінальні назви колонок.", "text-yellow-500 text-[10px]"); }
      } else {
        const inferredTypes = inferColumnTypes(activeData.columns, activeData.rows, engine, loc);
        const colsDef = activeData.columns.map(c => `${escapeIdent(c, engine)} ${inferredTypes[c]}`).join(', ');
        setupSql = `CREATE TABLE IF NOT EXISTS ${safeTargetTable} (${colsDef});\n`;
        if (mode === 'overwrite' && existingTables.includes(targetTable)) {
          setupSql = `DELETE FROM ${safeTargetTable};\n` + setupSql;
        }
      }

      let prefixSql = ''; let suffixSql = '';
      if (disableFK) {
        if (engine === 'mysql') { prefixSql += 'SET FOREIGN_KEY_CHECKS=0;\n'; suffixSql += '\nSET FOREIGN_KEY_CHECKS=1;'; }
        else if (engine === 'postgres') { prefixSql += "SET session_replication_role = 'replica';\n"; suffixSql += "\nSET session_replication_role = 'origin';"; }
      }
      if (useTx) { prefixSql += 'BEGIN;\n'; suffixSql += '\nCOMMIT;'; }

      if (setupSql) {
        try {
          if (btnExecEditor) btnExecEditor.disabled = true;
          const rSetup = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: setupSql, db_id, god_mode: true }) });
          if (!rSetup.ok) throw new Error("Помилка підготовки таблиці");
        } catch (e) {
          if (btnExecEditor) btnExecEditor.disabled = false;
          return writeLog(`> ${e.message}`, "text-red-500 font-bold");
        }
      }

      let activeCsvIndices = [];
      let targetColsString = '';

      if (actualMapping) {
        activeCsvIndices = actualMapping.map(m => m.csvIdx);
        targetColsString = actualMapping.map(m => escapeIdent(m.dbCol, engine)).join(', ');
      } else {
        activeCsvIndices = activeData.columns.map((_, i) => i);
        targetColsString = activeData.columns.map(c => escapeIdent(c, engine)).join(', ');
      }

      const CHUNK_SIZE = useTx ? 5000 : 500;
      const totalChunks = Math.ceil(activeData.rows.length / CHUNK_SIZE);
      let successCount = 0;
      let batchPayload = prefixSql;

      for (let i = 0; i < totalChunks; i++) {
        const chunkRows = activeData.rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        const valuesBatch = chunkRows.map(row => {
          const vals = activeCsvIndices.map(idx => {
            const v = row[idx];
            if (v === null || v === '') return 'NULL';
            const escapedStr = String(v).replace(/'/g, "''");
            return `'${escapedStr}'`;
          });
          return `(${vals.join(', ')})`;
        }).join(',\n');

        let insertSql = '';
        if (ignore) {
          if (engine === 'mysql') insertSql = `INSERT IGNORE INTO ${safeTargetTable} (${targetColsString}) VALUES \n${valuesBatch};\n`;
          else if (engine === 'postgres') insertSql = `INSERT INTO ${safeTargetTable} (${targetColsString}) VALUES \n${valuesBatch} ON CONFLICT DO NOTHING;\n`;
          else insertSql = `INSERT INTO ${safeTargetTable} (${targetColsString}) VALUES \n${valuesBatch};\n`;
        } else {
          insertSql = `INSERT INTO ${safeTargetTable} (${targetColsString}) VALUES \n${valuesBatch};\n`;
        }

        if (i === 0) {
          const logSql = insertSql.length > 300 ? insertSql.substring(0, 300) + '\n... [ЗАПИТ СКОРОЧЕНО]' : insertSql;
          writeLog(`${loc.log_generated_sql || '> Приклад SQL:\n'}${logSql}`, "text-[var(--log-text)] opacity-70 font-mono text-[10px] whitespace-pre-wrap my-2 border-l-2 border-[var(--border)] pl-2");
        }

        if (useTx) {
          batchPayload += insertSql;
        } else {
          try {
            writeLog((loc.log_chunk_progress || '> Відправка чанку {0} з {1}...').replace('{0}', i + 1).replace('{1}', totalChunks).replace('{2}', chunkRows.length), "text-[var(--text)] text-[9px]");
            const r = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: insertSql, db_id, god_mode: true }) });
            if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
            successCount += chunkRows.length;
          } catch (e) {
            let errorMsg = e.message.replace(/\([\w\.]+\.(\w+Error)\)/, '[$1]');
            writeLog(`> Помилка в чанку ${i + 1}: ${errorMsg}`, "text-red-500 font-bold");
            break;
          }
        }
      }

      if (useTx) {
        batchPayload += suffixSql;
        try {
          writeLog("> Відправка глобальної транзакції на сервер...", "text-yellow-500 text-[10px]");
          const r = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: batchPayload, db_id, god_mode: true }) });
          if (!r.ok) { const d = await r.json(); throw new Error(d.detail); }
          successCount = activeData.rows.length;
        } catch (e) {
          let errorMsg = e.message.replace(/\([\w\.]+\.(\w+Error)\)/, '[$1]');
          writeLog(`> Помилка транзакції (Дані відкочено ROLLBACK): ${errorMsg}`, "text-red-500 font-bold");
        }
      }

      if (btnExecEditor) btnExecEditor.disabled = false;

      if (successCount > 0) {
        writeLog((loc.log_chunk_success || '> Успішно!').replace('{0}', successCount), "text-[var(--accent)] font-bold");

        // Після успішного імпорту перемикаємось на цю таблицю в БД
        session.view = 'db';
        session.tableName = targetTable;
        saveSession();
        updateUI();

        fetchTableList(db_id).then(() => {
          selectObj.value = targetTable;
          selectObj.dispatchEvent(new Event('change'));
        });
      }
      return;
    }

    // 🌍 СЦЕНАРІЙ 1: ДАМП БАЗИ ДАНИХ (Експорт усіх таблиць у JSON)
    if (!exportCheck.checked) {
      writeLog(loc.log_export_all || '> Експорт усіх таблиць...', "text-[var(--accent)] font-bold");
      let engine = db_id.split('_')[1] || 'sql';
      let metaSql = (engine === 'mysql') ? "SHOW TABLES;" : (engine === 'postgres') ? "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';" : (engine === 'mssql') ? "SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE';" : "SELECT table_name FROM user_tables;";
      try {
        const rMeta = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: metaSql, db_id, god_mode: true }) });
        const metaData = await rMeta.json();
        if (!rMeta.ok || !metaData.rows) throw new Error("Не вдалося отримати мета-дані БД");
        const tables = metaData.rows.map(r => r[0]);
        let dbDump = { _meta: { engine: engine, timestamp: new Date().toISOString(), total_tables: tables.length }, data: {} };
        writeLog(`> Знайдено таблиць: ${tables.length}. Вивантаження даних...`, "text-[var(--text)] italic");
        for (const tb of tables) {
          const rData = await fetch(`${config.API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: `SELECT * FROM ${tb};`, db_id, god_mode: true }) });
          const tData = await rData.json();
          if (rData.ok) dbDump.data[tb] = { columns: tData.columns, rows: tData.rows };
        }
        const jsonContent = JSON.stringify(dbDump, null, 2);
        const fileName = `db_dump_${engine}_${new Date().getTime()}.json`;
        if ('showSaveFilePicker' in window) {
          const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Database JSON Dump (.json)', accept: { 'application/json': ['.json'] } }] });
          const writable = await handle.createWritable(); await writable.write(jsonContent); await writable.close();
        } else {
          const blob = new Blob([jsonContent], { type: 'application/json' }); const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
        }
        writeLog(`> Дамп успішно збережено: ${fileName}`, "text-[var(--accent)] font-bold");
      } catch (err) { writeLog(`> Помилка дампу БД: ${err.message}`, "text-red-500 font-bold"); }
      return;
    }

    // 📄 СЦЕНАРІЙ 2: ЗБЕРЕЖЕННЯ ПОТОЧНОЇ ТАБЛИЦІ У CSV
    const curData = getActiveData();
    if (!curData || !curData.columns || curData.rows.length === 0) return writeLog("> Немає даних для збереження.", "text-yellow-500 font-bold");

    const header = curData.columns.join(',');
    const rows = curData.rows.map(row => row.map(v => {
      if (v === null) return ''; let str = String(v);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) str = `"${str.replace(/"/g, '""')}"`;
      return str;
    }).join(',')).join('\n');

    let engine = db_id.split('_')[1] || 'sql';
    const csvContent = `${header}\n${rows}`;
    let baseName = session.view === 'db' ? session.tableName : (session.view === 'query' ? 'query_result' : 'preview');
    const fileName = `${baseName}_export_${engine}_${new Date().getTime()}.csv`;

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Data Table (CSV)', accept: { 'text/csv': ['.csv'] } }] });
        const writable = await handle.createWritable(); await writable.write(csvContent); await writable.close();
        writeLog(`> Дані успішно збережено як ${fileName}`, "text-[var(--accent)] font-bold");
      } else {
        const blob = new Blob([csvContent], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
      }
    } catch (e) { if (e.name !== 'AbortError') writeLog(`> Помилка експорту: ${e.message}`, "text-red-500 font-bold"); }
  });

  // --- ІМПОРТ: ЧИТАННЯ ФАЙЛУ (ArrayBuffer) ---
  btnOpen.addEventListener('click', () => {
    const loc = translations[currentLang] || translations['uk'];
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json,.sql';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      writeLog(`> Читання файлу ${file.name}...`, "text-[var(--text)]");
      const reader = new FileReader();
      reader.onload = (r) => {
        const buffer = r.target.result;
        let fileText = ''; let encodingName = 'UTF-8';
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          fileText = decoder.decode(buffer);
        } catch (err) {
          const decoderFallback = new TextDecoder('windows-1251');
          fileText = decoderFallback.decode(buffer); encodingName = 'Windows-1251 (Fallback)';
        }
        writeLog((loc.log_encoding_detected || '> Визначено кодування: {0}').replace('{0}', encodingName), "text-[var(--text)] text-[10px]");

        let parsedData = null;
        let rawSql = '';
        let isSqlFile = false;

        if (ext === 'csv') parsedData = parseCSV(fileText);
        else if (ext === 'json') parsedData = parseJSON(fileText);
        else if (ext === 'sql') {
          parsedData = prepareSQLPreview(fileText);
          rawSql = fileText;
          isSqlFile = true;
        }

        if (!parsedData) return writeLog("> [Помилка] Файл порожній або має непідтримуваний формат.", "text-red-500 font-bold");
        if (ext === 'csv' || ext === 'json') parsedData = sanitizeData(parsedData, loc);

        writeLog(`${loc.log_file_parsed || '> Файл проаналізовано: '}${file.name}`, "text-[var(--accent)] italic");

        // Зберігаємо в сесію
        session.previewData = parsedData;
        session.fileName = file.name;
        session.isSqlFile = isSqlFile;
        session.rawSql = rawSql;
        session.view = 'preview';
        saveSession();
        updateUI();

        renderGrid(session.previewData);
        const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
        if (db_id) fetchTableList(db_id);
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}
