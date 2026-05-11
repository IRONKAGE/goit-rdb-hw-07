import { writeLog } from './5_ConsoleLogger.js';
import config from '../config.js';
import uk from '../locales/uk.js';
import en from '../locales/en.js';

const translations = { uk, en };
let currentLang = localStorage.getItem('ide_lang') || 'uk';

export function initSchemaInspector(containerId) {
  const container = document.getElementById(containerId);
  let currentSchema = {};
  let currentTable = '';

  let fkMap = {};
  let pkMap = {};
  let ukMap = {};

  function renderBaseUI() {
    const loc = translations[currentLang] || translations['uk'];
    container.innerHTML = `
        <div class="panel-header flex items-center gap-3 relative z-40 w-full min-h-[36px] px-2 border-b border-[var(--border)]">
            <span class="text-[10px] uppercase font-bold tracking-wider opacity-70 whitespace-nowrap flex-shrink-0">
                ${loc.si_title || 'SCHEMA:'}
            </span>

            <div class="relative group flex-grow min-w-[50px]">
                <select id="si-table-select" class="appearance-none bg-black/30 border border-[var(--border)] text-[var(--accent)] font-bold text-[10px] pl-2 pr-7 py-1 rounded cursor-pointer outline-none hover:border-[var(--accent)] transition-colors focus:ring-1 focus:ring-[var(--accent)] shadow-inner w-full text-ellipsis overflow-hidden whitespace-nowrap">
                    <option value="" disabled selected>${loc.dg_loading || '⏳ Завантаження...'}</option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-[var(--accent)] bg-[var(--panel)] border-l border-[var(--border)] rounded-r opacity-90">
                    <svg class="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>

            <div class="flex gap-2 items-center border-l border-[var(--border)] pl-3 flex-shrink-0">
                <button id="btn-refresh-schema" class="btn-base px-2 py-1 text-[10px] hover:text-[var(--accent)] transition-colors disabled:opacity-50" title="${loc.si_refresh || 'Оновити схему'}">🔄</button>
                <button id="btn-show-erd" class="btn-base whitespace-nowrap flex-shrink-0 text-[9px] uppercase font-bold px-2 py-1 transition-colors border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black">ERD</button>
            </div>
        </div>

        <div id="si-actions" class="hidden panel-header bg-black/20 flex justify-between items-center px-2 py-1 border-b border-[var(--border)] min-h-[30px]">
            <span class="text-[9px] text-[var(--log-text)] opacity-70 font-bold tracking-wider">${loc.si_actions || 'ДІЇ:'}</span>
            <div class="flex gap-2">
                <button id="btn-insert-sql" class="btn-base px-2 py-0.5 text-[9px] text-[var(--text)] hover:text-blue-400 border border-[var(--border)] flex items-center gap-1 transition-colors" title="${loc.si_btn_sql || 'Вставити SQL'}">
                    <span>📄</span> [+ SQL]
                </button>
                <button id="btn-open-grid" class="btn-base px-2 py-0.5 text-[9px] text-[var(--text)] hover:text-yellow-400 border border-[var(--border)] flex items-center gap-1 transition-colors" title="${loc.si_btn_grid || 'Відкрити в Grid'}">
                    <span>⚡</span> GRID
                </button>
            </div>
        </div>

        <div id="si-container" class="flex-grow overflow-auto p-0 bg-black/10 relative">
            <div id="si-status" class="p-4 text-[10px] text-[var(--log-text)] italic text-center opacity-70">
                ${loc.si_empty || 'Очікування...'}
            </div>
            <table id="si-table" class="hidden w-full text-left text-[11px] border-collapse">
                <thead class="sticky top-0 bg-[var(--panel)] shadow-sm z-10">
                    <tr>
                        <th class="p-2 border-b border-[var(--border)] w-8 text-center opacity-70" title="${loc.si_col_key || 'Ключ'}">🔑</th>
                        <th class="p-2 border-b border-[var(--border)] uppercase text-[var(--log-text)] font-bold opacity-80">${loc.si_col_name || 'Поле'}</th>
                        <th class="p-2 border-b border-[var(--border)] uppercase text-[var(--log-text)] font-bold opacity-80">${loc.si_col_type || 'Тип'}</th>
                    </tr>
                </thead>
                <tbody id="si-tbody"></tbody>
            </table>
        </div>
    `;

    document.getElementById('btn-show-erd').addEventListener('click', openErdModal);
    document.getElementById('btn-refresh-schema').addEventListener('click', () => {
      const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
      if (db_id) fetchDatabaseSchema(db_id);
    });
    document.getElementById('si-table-select').addEventListener('change', (e) => {
      currentTable = e.target.value;
      renderTableSchema(currentTable);
    });

    document.getElementById('btn-insert-sql').addEventListener('click', () => {
      if (!currentTable || !currentSchema[currentTable]) return;
      const cols = currentSchema[currentTable].map(c => c.name).join(', ');
      const sql = `SELECT ${cols} FROM ${currentTable};`;
      const cm = document.querySelector('.CodeMirror')?.CodeMirror;
      if (cm) {
        const cursor = cm.getCursor();
        cm.replaceRange(sql + '\n', cursor);
        writeLog(`> Шаблон SQL для ${currentTable} вставлено в редактор.`, "text-blue-400 font-bold");
      }
    });

    document.getElementById('btn-open-grid').addEventListener('click', () => {
      if (currentTable) openTableInDataGrid(currentTable);
    });
  }

  renderBaseUI();

  document.addEventListener('lang-changed', (e) => {
    currentLang = e.detail;
    renderBaseUI();
    populateSelect();
    if (currentTable) {
      document.getElementById('si-table-select').value = currentTable;
      renderTableSchema(currentTable);
    }
  });

  document.addEventListener('db-changed', (e) => {
    fetchDatabaseSchema(e.detail.id);
  });

  const initialDb = localStorage.getItem('ide_target_db');
  if (initialDb) fetchDatabaseSchema(initialDb);

  async function fetchDatabaseSchema(db_id) {
    if (!db_id) return;
    const loc = translations[currentLang] || translations['uk'];
    const selectEl = document.getElementById('si-table-select');
    const btnRefresh = document.getElementById('btn-refresh-schema');

    selectEl.innerHTML = `<option value="" disabled selected>${loc.dg_loading || '⏳ Завантаження...'}</option>`;
    btnRefresh.classList.add('animate-spin');

    let engine = db_id.split('_')[1] || 'sql';

    // 1. Отримання колонок (Тільки для поточної бази!)
    let metaSql = '';
    if (engine === 'oracle') {
      metaSql = `SELECT table_name, column_name, data_type, data_length, nullable FROM user_tab_columns ORDER BY table_name, column_id`;
    } else if (engine === 'mysql') {
      metaSql = `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position;`;
    } else {
      metaSql = `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'sys', 'dbo') ORDER BY table_name, ordinal_position;`;
    }

    // 2. Отримання FOREIGN KEYS
    let fkSql = '';
    if (engine === 'postgres' || engine === 'mssql') {
      fkSql = `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name FROM information_schema.table_constraints AS tc JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY';`;
    } else if (engine === 'mysql') {
      fkSql = `SELECT table_name, column_name, referenced_table_name FROM information_schema.key_column_usage WHERE referenced_table_name IS NOT NULL AND table_schema = DATABASE();`;
    } else if (engine === 'oracle') {
      fkSql = `SELECT a.table_name, a.column_name, c_pk.table_name AS foreign_table_name FROM user_cons_columns a JOIN user_constraints c ON a.constraint_name = c.constraint_name JOIN user_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name WHERE c.constraint_type = 'R';`;
    }

    // 3. Отримання PRIMARY та UNIQUE KEYS
    let pkUkSql = '';
    if (engine === 'postgres' || engine === 'mssql') {
      pkUkSql = `
            SELECT tc.table_name, kcu.column_name, tc.constraint_type
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
              AND tc.table_schema NOT IN ('information_schema', 'pg_catalog', 'sys', 'dbo');
        `;
    } else if (engine === 'mysql') {
      pkUkSql = `
            SELECT tc.table_name, kcu.column_name, tc.constraint_type
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
              AND tc.table_schema = DATABASE();
        `;
    } else if (engine === 'oracle') {
      pkUkSql = `
            SELECT c.table_name, cols.column_name,
                   CASE WHEN c.constraint_type = 'P' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END as constraint_type
            FROM user_constraints c
            JOIN user_cons_columns cols ON c.constraint_name = cols.constraint_name
            WHERE c.constraint_type IN ('P', 'U');
        `;
    }

    try {
      const r = await fetch(`${config.API_URL}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: metaSql, db_id, god_mode: true })
      });
      const data = await r.json();

      currentSchema = {};
      currentTable = '';
      fkMap = {};
      pkMap = {};
      ukMap = {};

      if (!r.ok || !data.rows || data.rows.length === 0) {
        selectEl.innerHTML = `<option value="" disabled selected>${loc.dg_no_tables || "Відсутні таблиці"}</option>`;
        document.getElementById('si-status').classList.remove('hidden');
        document.getElementById('si-table').classList.add('hidden');
        document.getElementById('si-actions').classList.add('hidden');
        return;
      }

      data.rows.forEach(row => {
        const tName = row[0], cName = row[1], dType = String(row[2]).toUpperCase();
        const maxLen = row[3] ? `(${row[3]})` : '';
        const isNull = String(row[4]).toUpperCase() === 'YES' || String(row[4]).toUpperCase() === 'Y';
        if (!currentSchema[tName]) currentSchema[tName] = [];
        currentSchema[tName].push({ name: cName, type: `${dType}${maxLen}`, nullable: isNull });
      });

      if (fkSql) {
        try {
          const rFk = await fetch(`${config.API_URL}/execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: fkSql, db_id, god_mode: true })
          });
          const fkData = await rFk.json();
          if (rFk.ok && fkData.rows) {
            fkData.rows.forEach(row => { fkMap[`${row[0]}.${row[1]}`] = row[2]; });
          }
        } catch (e) { }
      }

      if (pkUkSql) {
        try {
          const rPkUk = await fetch(`${config.API_URL}/execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: pkUkSql, db_id, god_mode: true })
          });
          const cData = await rPkUk.json();
          if (rPkUk.ok && cData.rows) {
            cData.rows.forEach(row => {
              const tName = row[0], cName = row[1], cType = row[2];
              if (cType === 'PRIMARY KEY') {
                if (!pkMap[tName]) pkMap[tName] = [];
                pkMap[tName].push(cName);
              } else if (cType === 'UNIQUE') {
                ukMap[`${tName}.${cName}`] = true;
              }
            });
          }
        } catch (e) { }
      }

      populateSelect();
    } catch (err) {
      selectEl.innerHTML = `<option value="" disabled selected>Помилка</option>`;
      writeLog(`[Schema Error] ${err.message}`, "text-red-500 font-bold");
    } finally {
      btnRefresh.classList.remove('animate-spin');
    }
  }

  function populateSelect() {
    const loc = translations[currentLang] || translations['uk'];
    const selectEl = document.getElementById('si-table-select');
    const tables = Object.keys(currentSchema);

    if (tables.length === 0) return;

    let optionsHtml = `<option value="" disabled selected>${loc.dg_choose_table || 'Оберіть таблицю...'}</option>`;
    tables.forEach(t => { optionsHtml += `<option value="${t}">${t}</option>`; });
    selectEl.innerHTML = optionsHtml;

    if (currentTable && tables.includes(currentTable)) {
      selectEl.value = currentTable;
      renderTableSchema(currentTable);
    }
  }

  async function openTableInDataGrid(tableName) {
    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    writeLog(`> Відкриття ${tableName} у Data Grid...`, "text-yellow-400");
    try {
      const r = await fetch(`${config.API_URL}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `SELECT * FROM ${tableName};`, db_id, god_mode: true })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Server Error");

      document.dispatchEvent(new CustomEvent('data-ready', { detail: data }));

      const gridSelect = document.getElementById('grid-table-select');
      if (gridSelect) {
        const opt = Array.from(gridSelect.options).find(o => o.value === tableName);
        if (opt) {
          gridSelect.value = tableName;
          gridSelect.dispatchEvent(new Event('change'));
        }
      }
    } catch (err) { writeLog(`[Помилка] ${err.message}`, "text-red-500 font-bold"); }
  }

  function getKeyDetails(tName, cName) {
    const loc = translations[currentLang] || translations['uk'];
    let kTitles = [];
    let emojis = [];
    let targetAttr = '';
    let isPhysicalLink = false;

    let realFkTarget = fkMap[`${tName}.${cName}`];
    let isRealPk = pkMap[tName] && pkMap[tName].includes(cName);
    let isComposite = isRealPk && pkMap[tName].length > 1;
    let isRealUk = ukMap[`${tName}.${cName}`];

    let targetBase = cName.toLowerCase().endsWith('_id') ? cName.toLowerCase().replace('_id', '') : '';
    let tNameL = tName.toLowerCase();
    let isHeuristicPk = !isRealPk && (
      (cName.toLowerCase() === 'id') ||
      (tNameL === targetBase) ||
      (tNameL === targetBase + 's') ||
      (tNameL.endsWith('_' + targetBase)) ||
      (tNameL.endsWith('_' + targetBase + 's')));

    if (isRealPk) {
      kTitles.push(isComposite ? (loc.si_key_comp || 'Composite PK') : (loc.si_key_pk || 'Primary Key'));
      emojis.push(isComposite ? '🗝️' : '🔑');
    } else if (isHeuristicPk) {
      kTitles.push(loc.si_key_pk_heur || 'PK (Heuristic)');
      emojis.push('🔑');
    } else if (isRealUk) {
      kTitles.push(loc.si_key_uk || 'Unique Key');
      emojis.push('🔐');
    }

    if (realFkTarget) {
      kTitles.push((loc.si_key_fk || 'FK ➔ {0}').replace('{0}', realFkTarget));
      if (emojis.length === 0) emojis.push('🔗');
      targetAttr = `data-fk="${realFkTarget}"`;
      isPhysicalLink = true;
    } else if (targetBase && !isHeuristicPk) {
      kTitles.push(loc.si_key_fk_heur || 'FK (Heuristic)');
      if (emojis.length === 0) emojis.push('🔗');
      targetAttr = `data-fk="${targetBase}" data-fk-plural="${targetBase}s"`;
      isPhysicalLink = false;
    }

    let finalEmoji = emojis.join('') || '<span style="opacity: 0; pointer-events: none; user-select: none;">🔑</span>';

    return { kEmoji: finalEmoji, kTitle: kTitles.join(' | '), targetAttr, isPhysicalLink };
  }

  function renderTableSchema(tableName) {
    const tbody = document.getElementById('si-tbody');
    const tableEl = document.getElementById('si-table');
    const statusEl = document.getElementById('si-status');
    const actionsEl = document.getElementById('si-actions');
    const cols = currentSchema[tableName];

    if (!cols) return;

    let html = '';
    cols.forEach(col => {
      const { kEmoji, kTitle } = getKeyDetails(tableName, col.name);
      const keyIcon = kTitle ? `<span class="cursor-help" title="${kTitle}">${kEmoji}</span>` : kEmoji;

      html += `
            <tr class="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors cursor-pointer group" onclick="navigator.clipboard.writeText('${col.name}')" title="Клікніть, щоб скопіювати">
                <td class="p-2 text-center text-[10px] bg-black/20 border-r border-[var(--border)]/30">${keyIcon}</td>
                <td class="p-2 text-[var(--text)] font-mono font-bold group-hover:text-[var(--accent)] transition-colors">${col.name}</td>
                <td class="p-2 text-[var(--log-text)] font-mono text-[9px] opacity-80">
                    ${col.type} ${col.nullable ? '' : '<span class="text-red-400">*</span>'}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    statusEl.classList.add('hidden');
    tableEl.classList.remove('hidden');
    actionsEl.classList.remove('hidden');
  }

  // --- 🌟 УЛЬТИМАТИВНА АВТО-СІТКА (MASONRY DAG) ---
  function applyAutoGrid(cardElements, animate = false) {
    const canvas = document.getElementById('erd-canvas');
    if (!canvas) return;

    let nodes = Array.from(cardElements).map(c => c.getAttribute('data-table'));
    let adj = {};
    nodes.forEach(n => adj[n] = new Set());

    // Будуємо графи залежностей
    cardElements.forEach(card => {
      let u = card.getAttribute('data-table');
      card.querySelectorAll('.fk-row[data-fk]').forEach(fk => {
        let v1 = fk.getAttribute('data-fk');
        let v2 = fk.getAttribute('data-fk-plural');
        if (nodes.includes(v1) && v1 !== u) adj[v1].add(u); // Батько -> Дитина
        if (nodes.includes(v2) && v2 !== u) adj[v2].add(u);
      });
    });

    // Рахуємо дистанцію від коренів
    let levels = {};
    nodes.forEach(n => levels[n] = 0);
    let changed = true;
    let iter = 0;
    while (changed && iter < 100) {
      changed = false;
      nodes.forEach(u => {
        adj[u].forEach(v => {
          if (levels[v] <= levels[u]) {
            levels[v] = levels[u] + 1;
            changed = true;
          }
        });
      });
      iter++;
    }

    let cardMap = {};
    cardElements.forEach(c => cardMap[c.getAttribute('data-table')] = c);

    const cardWidth = 250;
    const gapX = 120; // Відступ між батьком і дитиною
    const gapY = 40;
    const canvasWidth = Math.max(canvas.offsetWidth || window.innerWidth, 1000);

    let currentX = 40;
    let currentY = 40;
    let rowMaxH = 0;
    let rowMaxLevel = 0;

    // Розбиваємо таблиці на незалежні "Острови" (Connected Components)
    let visited = new Set();
    let components = [];
    nodes.forEach(n => {
      if (!visited.has(n)) {
        let comp = [];
        let q = [n];
        visited.add(n);
        while (q.length > 0) {
          let curr = q.shift();
          comp.push(curr);
          // Шукаємо сусідів в обидва боки
          nodes.forEach(neighbor => {
            if (!visited.has(neighbor)) {
              if (adj[curr].has(neighbor) || adj[neighbor].has(curr)) {
                visited.add(neighbor);
                q.push(neighbor);
              }
            }
          });
        }
        components.push(comp);
      }
    });

    // Малюємо кожен острів
    components.forEach(comp => {
      // Шукаємо макс рівень в цьому острові, щоб знати його ширину
      let maxLvlInComp = 0;
      comp.forEach(n => { if (levels[n] > maxLvlInComp) maxLvlInComp = levels[n]; });

      let compWidth = (maxLvlInComp + 1) * cardWidth + maxLvlInComp * gapX;

      // Якщо острів не влазить по ширині — переносимо на новий рядок
      if (currentX + compWidth > canvasWidth && currentX > 40) {
        currentX = 40;
        currentY += rowMaxH + gapY;
        rowMaxH = 0;
      }

      let compMaxH = 0;
      let levelYOffsets = {};

      comp.forEach(n => {
        let lvl = levels[n];
        if (!levelYOffsets[lvl]) levelYOffsets[lvl] = 0;

        let card = cardMap[n];
        let xPos = currentX + lvl * (cardWidth + gapX);
        let yPos = currentY + levelYOffsets[lvl];

        if (animate) {
          card.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
          setTimeout(() => { card.style.transition = 'colors 0.3s'; }, 500);
        }

        card.style.left = xPos + 'px';
        card.style.top = yPos + 'px';
        card.style.opacity = '1';

        let cardH = card.offsetHeight;
        levelYOffsets[lvl] += cardH + gapY;

        if (levelYOffsets[lvl] > compMaxH) compMaxH = levelYOffsets[lvl];
      });

      // Зсуваємо курсор вправо після малювання острова
      currentX += compWidth + gapX;
      if (compMaxH > rowMaxH) rowMaxH = compMaxH;
    });
  }

  function drawLineBetween(srcRow, target1, target2, isNullable, isUnique, isPhysical, animate = false) {
    const erdCanvas = document.getElementById('erd-canvas');
    const linesGroup = document.getElementById('erd-lines-group');
    const cards = document.querySelectorAll('.erd-card');

    let targetCard = Array.from(cards).find(c => {
      let t = c.getAttribute('data-table');
      return t === target1 || t === target2;
    });
    let srcCard = srcRow.closest('.erd-card');

    if (!targetCard || !srcCard || !linesGroup) return;

    const canvasRect = erdCanvas.getBoundingClientRect();
    const srcRect = srcRow.getBoundingClientRect();
    const tgtRect = targetCard.getBoundingClientRect();

    const scrollX = erdCanvas.scrollLeft;
    const scrollY = erdCanvas.scrollTop;

    let x1, y1, x2, y2, cX1, cX2, cY1, cY2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    if (srcCard === targetCard) {
      x1 = srcRect.right - canvasRect.left + scrollX;
      y1 = srcRect.top + srcRect.height / 2 - canvasRect.top + scrollY;
      x2 = tgtRect.right - canvasRect.left + scrollX;
      y2 = tgtRect.top + 20 - canvasRect.top + scrollY;

      cX1 = x1 + 100; cY1 = y1;
      cX2 = x2 + 100; cY2 = y2;

      path.setAttribute('d', `M ${x1} ${y1} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${x2} ${y2}`);
    } else {
      y1 = srcRect.top + srcRect.height / 2 - canvasRect.top + scrollY;
      y2 = tgtRect.top + 20 - canvasRect.top + scrollY;

      if (srcRect.left < tgtRect.left) {
        x1 = srcRect.right - canvasRect.left + scrollX;
        x2 = tgtRect.left - canvasRect.left + scrollX;
      } else {
        x1 = srcRect.left - canvasRect.left + scrollX;
        x2 = tgtRect.right - canvasRect.left + scrollX;
      }

      const dx = Math.abs(x2 - x1);
      const curveOffset = Math.max(50, dx * 0.4);

      if (srcRect.left < tgtRect.left) {
        cX1 = x1 + curveOffset; cX2 = x2 - curveOffset;
      } else {
        cX1 = x1 - curveOffset; cX2 = x2 + curveOffset;
      }

      path.setAttribute('d', `M ${x1} ${y1} C ${cX1} ${y1}, ${cX2} ${y2}, ${x2} ${y2}`);
    }

    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--accent)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '6 6');

    let startMarker = '';
    let endMarker = 'url(#crow-target-one-only)';

    if (isPhysical) {
      if (isUnique) startMarker = isNullable ? 'url(#crow-zero-one)' : 'url(#crow-one-only)';
      else startMarker = isNullable ? 'url(#crow-zero-many)' : 'url(#crow-one-many)';
    } else {
      startMarker = 'url(#crow-many)';
      endMarker = 'url(#crow-target-one)';
    }

    path.setAttribute('marker-start', startMarker);
    path.setAttribute('marker-end', endMarker);

    if (animate) {
      path.innerHTML = `<animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.5s" repeatCount="indefinite" linear/>`;
    }

    linesGroup.appendChild(path);
  }

  function openErdModal() {
    const loc = translations[currentLang] || translations['uk'];
    const erdModal = document.getElementById('erd-modal');
    if (!erdModal || Object.keys(currentSchema).length === 0) return writeLog("> Схема порожня", "text-yellow-500");

    erdModal.classList.remove('backdrop-blur-sm', 'bg-black/95');
    erdModal.classList.add('bg-black/90', 'backdrop-blur-none');

    const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
    let savedPos = JSON.parse(localStorage.getItem(`erd_pos_${db_id}`)) || {};

    let cardsHtml = Object.entries(currentSchema).map(([tName, cols]) => {
      let colsHtml = cols.map(c => {
        const { kEmoji, kTitle, targetAttr, isPhysicalLink } = getKeyDetails(tName, c.name);
        const keyIcon = kTitle ? `<span class="text-[10px] cursor-help" title="${kTitle}">${kEmoji}</span>` : `<span class="text-[10px]">${kEmoji}</span>`;

        const isUnique = ukMap[`${tName}.${c.name}`] ? 'true' : 'false';

        return `
            <div data-col-name="${c.name}" data-nullable="${c.nullable}" data-unique="${isUnique}" data-physical="${isPhysicalLink}" ${targetAttr} class="fk-row flex justify-between items-center px-2 py-1 border-b border-[var(--border)]/30 hover:bg-white/10 transition-colors ${targetAttr ? 'cursor-help' : ''}">
                <div class="flex items-center gap-2 pointer-events-none">
                    ${keyIcon}
                    <span class="text-[var(--text)] font-mono text-[11px]">${c.name}</span>
                </div>
                <span class="text-[var(--log-text)] text-[9px] font-mono opacity-70 pointer-events-none">${c.type}</span>
            </div>
        `}).join('');

      let saved = savedPos[tName];
      let styleAttr = '';
      let classAttr = '';

      if (saved && saved.x !== undefined && saved.y !== undefined) {
        let savedZ = saved.z || '';
        styleAttr = `style="left: ${saved.x}px; top: ${saved.y}px; z-index: ${savedZ};" data-saved-z="${savedZ}"`;
      } else {
        styleAttr = `style="opacity: 0;"`;
        classAttr = 'needs-layout';
      }

      return `
            <div class="erd-card absolute bg-[var(--panel)] border border-[var(--border)] rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.5)] w-[250px] flex flex-col max-h-[75vh] transition-colors ${classAttr}" data-table="${tName.toLowerCase()}" ${styleAttr}>
                <div class="erd-card-header bg-black/40 p-2 border-b border-[var(--border)] flex justify-between items-center shadow-sm cursor-move select-none group z-10 rounded-t-md">
                    <div class="flex items-center gap-2 overflow-hidden truncate">
                        <span class="text-[var(--accent)] font-bold truncate" title="${tName}">📁 ${tName}</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button class="btn-ddl text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-black rounded px-1.5 py-0.5 opacity-60 hover:opacity-100 transition-all font-bold" data-table="${tName}" title="${loc.si_btn_ddl || 'Копіювати DDL'}">&lt;/&gt;</button>
                        <span class="text-[9px] opacity-80 bg-[var(--bg)] px-1.5 py-0.5 rounded text-[var(--text)]">${cols.length}</span>
                    </div>
                </div>
                <div class="flex flex-col flex-grow overflow-y-auto custom-scrollbar p-1 z-10 bg-[var(--panel)] rounded-b-md">
                    ${colsHtml}
                </div>
            </div>
        `;
    }).join('');

    erdModal.innerHTML = `
        <div class="w-[95vw] h-[95vh] bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-[0_0_50px_rgba(0,0,0,1)] flex flex-col overflow-hidden relative transform scale-95 opacity-0 transition-all duration-200" id="erd-box">
            <div class="panel-header p-4 flex justify-between items-center border-b border-[var(--border)] shadow-md bg-[var(--panel)] z-20">
                <div class="flex items-center gap-3">
                    <span class="text-[var(--accent)] font-bold tracking-widest text-[14px]">${loc.si_erd_title || '🗄️ ENTITY-RELATIONSHIP DIAGRAM'}</span>
                    <span class="text-[10px] text-[var(--log-text)] opacity-60 uppercase border border-[var(--border)] px-2 py-0.5 rounded-full">${Object.keys(currentSchema).length} ${loc.si_tables_count || 'Tables'}</span>
                </div>
                <div class="flex items-center gap-3">
                    <button id="btn-export-erd" class="btn-base px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500 hover:text-white rounded transition-all shadow-inner text-[10px] uppercase font-bold flex items-center gap-1" title="${loc.si_export_title || 'Експорт діаграми'}">
                        📸 Експорт
                    </button>
                    <button id="btn-reset-erd" class="btn-base px-3 py-1.5 bg-black/40 border border-[var(--border)] text-[var(--log-text)] hover:text-[var(--accent)] hover:border-[var(--accent)] rounded transition-all shadow-inner text-[10px] uppercase font-bold flex items-center gap-1" title="Скинути розташування">
                        <span>✨</span> ${loc.si_reset_layout || 'Авто-сітка'}
                    </button>
                    <input type="text" id="erd-search" placeholder="${loc.si_search || '🔍 Пошук таблиці...'}" class="bg-black/40 border border-[var(--border)] text-[var(--accent)] text-[11px] font-bold px-3 py-1.5 rounded outline-none focus:border-[var(--accent)] transition-colors w-[250px] shadow-inner ml-2">
                    <button id="btn-close-erd" class="text-[var(--log-text)] hover:text-red-500 hover:rotate-90 transform transition-all font-bold px-3 text-lg cursor-pointer outline-none">✕</button>
                </div>
            </div>

            <div id="erd-canvas" class="flex-grow overflow-auto relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSI+PC9yZWN0Pgo8Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSI+PC9jaXJjbGU+Cjwvc3ZnPg==')]">

                <svg id="erd-svg-overlay" class="absolute top-0 left-0 pointer-events-none z-10" style="width: 100%; height: 100%; overflow: visible;">
                    <defs>
                        <marker id="crow-one" markerWidth="14" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><path d="M 8 0 L 8 12 M 12 6 L 2 6" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-many" markerWidth="14" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><path d="M 12 0 L 2 6 L 12 12 M 12 6 L 2 6" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-target-one-only" markerWidth="14" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M 6 0 L 6 12 M 10 0 L 10 12" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-one-only" markerWidth="14" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><path d="M 4 0 L 4 12 M 8 0 L 8 12 M 12 6 L 2 6" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-zero-one" markerWidth="16" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><circle cx="8" cy="6" r="2.5" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path d="M 4 0 L 4 12 M 12 6 L 2 6" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-one-many" markerWidth="14" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><path d="M 12 0 L 2 6 L 12 12 M 12 6 L 2 6" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path d="M 8 0 L 8 12" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-zero-many" markerWidth="16" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><circle cx="12" cy="6" r="2.5" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path d="M 8 0 L 2 6 L 8 12 M 8 6 L 2 6" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                        <marker id="crow-target-one" markerWidth="14" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M 10 0 L 10 12" fill="none" stroke="var(--accent)" stroke-width="1.5"/></marker>
                    </defs>
                    <g id="erd-lines-group"></g>
                </svg>

                ${cardsHtml}
            </div>
        </div>
    `;

    erdModal.classList.remove('hidden');

    document.getElementById('btn-export-erd').addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/90";
      overlay.innerHTML = `
            <div class="bg-[var(--panel)] border border-[var(--border)] p-5 rounded shadow-[0_0_30px_rgba(0,0,0,0.8)] min-w-[350px] transform scale-95 opacity-0 transition-all duration-200" id="export-settings-box">
                <div class="text-[var(--accent)] font-bold mb-4 text-lg border-b border-[var(--border)] pb-2">${loc.si_export_title || '📸 Експорт ER-Діаграми'}</div>

                <div class="flex flex-col gap-3 text-[12px] text-[var(--text)] mb-6">
                    <label class="flex items-center gap-2 cursor-pointer hover:text-[var(--accent)] transition-colors">
                        <input type="checkbox" id="exp-bg" checked class="accent-[var(--accent)] w-4 h-4">
                        ${loc.si_export_bg || 'Прозорий фон (Без сітки)'}
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-[var(--accent)] transition-colors">
                        <input type="checkbox" id="exp-lines" checked class="accent-[var(--accent)] w-4 h-4">
                        ${loc.si_export_lines || "Малювати лінії зв'язків"}
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-[var(--accent)] transition-colors">
                        <input type="checkbox" id="exp-expand" checked class="accent-[var(--accent)] w-4 h-4">
                        ${loc.si_export_expand || 'Розгорнути таблиці (Всі поля без скролу)'}
                    </label>
                </div>

                <div class="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                    <button id="btn-exp-cancel" class="btn-base px-3 py-1.5 text-[11px] hover:text-red-500">❌ Відмінити</button>
                    <button id="btn-exp-svg" class="btn-base border border-purple-500/50 text-purple-400 hover:bg-purple-500 hover:text-white px-3 py-1.5 text-[11px] font-bold shadow-[0_0_10px_purple] transition-all">${loc.si_btn_svg || 'SVG'}</button>
                    <button id="btn-exp-png" class="btn-base bg-[var(--accent)]/20 border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black px-4 py-1.5 text-[11px] font-bold shadow-[0_0_15px_var(--accent)] transition-all">${loc.si_btn_png || 'PNG'}</button>
                </div>
            </div>
        `;
      document.body.appendChild(overlay);
      setTimeout(() => document.getElementById('export-settings-box').classList.remove('scale-95', 'opacity-0'), 10);

      const closeExp = () => overlay.remove();
      document.getElementById('btn-exp-cancel').onclick = closeExp;

      const executeExport = async (format) => {
        const btnPng = document.getElementById('btn-exp-png');
        const btnSvg = document.getElementById('btn-exp-svg');

        if (typeof window.htmlToImage === 'undefined') {
          btnPng.disabled = true; btnSvg.disabled = true;
          btnPng.innerText = "⏳ Бібліотека...";
          btnSvg.innerText = "⏳ Бібліотека...";
          try {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js";
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          } catch (e) {
            writeLog("> Помилка: Не вдалося завантажити бібліотеку експорту.", "text-red-500 font-bold");
            setTimeout(closeExp, 2000);
            return;
          }
        }

        btnPng.disabled = true; btnSvg.disabled = true;
        btnPng.innerText = loc.si_exporting || "⏳ Генеруємо...";
        btnSvg.innerText = loc.si_exporting || "⏳ Генеруємо...";

        const isTransparent = document.getElementById('exp-bg').checked;
        const showLines = document.getElementById('exp-lines').checked;
        const isExpanded = document.getElementById('exp-expand').checked;

        const canvasArea = document.getElementById('erd-canvas');
        const svgOverlay = document.getElementById('erd-svg-overlay');
        const linesGroup = document.getElementById('erd-lines-group');
        const cards = document.querySelectorAll('.erd-card');

        let originalStyles = [];
        const originalBg = canvasArea.style.background;
        const originalOverflow = canvasArea.style.overflow;

        if (isTransparent) canvasArea.style.background = 'transparent';

        if (isExpanded) {
          cards.forEach(c => {
            const body = c.querySelector('.custom-scrollbar');
            originalStyles.push({
              el: body,
              maxH: body.style.maxHeight,
              overflow: body.style.overflow,
              card: c
            });
            c.classList.remove('max-h-[75vh]');
            body.style.maxHeight = 'none';
            body.style.overflow = 'visible';
            c.style.height = 'auto';
          });
        }

        await new Promise(r => setTimeout(r, 200));

        linesGroup.innerHTML = '';
        if (showLines) {
          svgOverlay.style.display = '';
          document.querySelectorAll('.fk-row[data-fk]').forEach(fkRow => {
            const target1 = fkRow.getAttribute('data-fk');
            const target2 = fkRow.getAttribute('data-fk-plural');
            const isNullable = fkRow.getAttribute('data-nullable') === 'true';
            const isUnique = fkRow.getAttribute('data-unique') === 'true';
            const isPhysical = fkRow.getAttribute('data-physical') === 'true';
            drawLineBetween(fkRow, target1, target2, isNullable, isUnique, isPhysical, false);
          });
        } else {
          svgOverlay.style.display = 'none';
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cards.forEach(c => {
          const x = parseInt(c.style.left) || 0;
          const y = parseInt(c.style.top) || 0;
          const w = c.offsetWidth;
          const h = c.offsetHeight;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x + w > maxX) maxX = x + w;
          if (y + h > maxY) maxY = y + h;
        });

        const padding = 120;
        const cropWidth = (maxX - minX) + (padding * 2);
        const cropHeight = (maxY - minY) + (padding * 2);

        canvasArea.style.overflow = 'visible';
        canvasArea.style.width = cropWidth + padding + 'px';
        canvasArea.style.height = cropHeight + padding + 'px';

        const filterNode = (node) => !node.classList?.contains('hide-on-export');
        const options = {
          width: cropWidth,
          height: cropHeight,
          style: {
            transform: `translate(${-minX + padding}px, ${-minY + padding}px)`,
            background: isTransparent ? 'transparent' : 'var(--bg)'
          },
          filter: filterNode,
          pixelRatio: 2
        };

        try {
          const dbName = document.getElementById('db-select')?.value || 'database';
          const filename = `ERD_${dbName}_${new Date().getTime()}`;

          if (format === 'png') {
            const dataUrl = await window.htmlToImage.toPng(canvasArea, options);
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = dataUrl;
            link.click();
          } else if (format === 'svg') {
            const dataUrl = await window.htmlToImage.toSvg(canvasArea, options);
            const link = document.createElement('a');
            link.download = `${filename}.svg`;
            link.href = dataUrl;
            link.click();
          }
          writeLog(`> ER-Діаграму успішно експортовано (${format.toUpperCase()})`, "text-green-400 font-bold");
        } catch (err) {
          writeLog(`> Помилка експорту: ${err.message}`, "text-red-500 font-bold");
        } finally {
          canvasArea.style.background = originalBg;
          canvasArea.style.overflow = originalOverflow;
          canvasArea.style.width = '';
          canvasArea.style.height = '';
          svgOverlay.style.display = '';
          linesGroup.innerHTML = '';
          originalStyles.forEach(s => {
            s.el.style.maxHeight = s.maxH;
            s.el.style.overflow = s.overflow;
            s.card.classList.add('max-h-[75vh]');
            s.card.style.height = '';
          });
          closeExp();
        }
      };

      document.getElementById('btn-exp-png').onclick = () => executeExport('png');
      document.getElementById('btn-exp-svg').onclick = () => executeExport('svg');
    });

    setTimeout(() => {
      document.getElementById('erd-box').classList.remove('scale-95', 'opacity-0');
      const newCards = document.querySelectorAll('.erd-card.needs-layout');
      if (newCards.length > 0) {
        applyAutoGrid(newCards, false);
        newCards.forEach(c => c.classList.remove('needs-layout'));
      }
    }, 10);

    document.getElementById('btn-reset-erd').addEventListener('click', () => {
      localStorage.removeItem(`erd_pos_${db_id}`);
      applyAutoGrid(document.querySelectorAll('.erd-card'), true);
      writeLog(loc.si_reset_log || "> Розташування ERD скинуто до початкової сітки.", "text-[var(--accent)]");
    });

    document.getElementById('btn-close-erd').onclick = () => {
      document.getElementById('erd-box').classList.add('scale-95', 'opacity-0');
      setTimeout(() => { erdModal.classList.add('hidden'); erdModal.innerHTML = ''; }, 200);
    };

    document.getElementById('erd-search').addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('.erd-card').forEach(card => {
        const tName = card.getAttribute('data-table');
        if (tName.includes(term)) card.style.display = 'flex';
        else card.style.display = 'none';
      });
    });

    document.querySelectorAll('.btn-ddl').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tName = btn.getAttribute('data-table');
        const cols = currentSchema[tName];
        let ddl = `CREATE TABLE ${tName} (\n`;
        const lines = cols.map(c => `    ${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'}`);
        ddl += lines.join(',\n') + '\n);';
        navigator.clipboard.writeText(ddl);
        writeLog(`${loc.si_ddl_copied || '> DDL скопійовано:'} ${tName}`, "text-blue-400 font-bold");

        const originalHtml = btn.innerHTML;
        btn.innerHTML = '✔️';
        btn.classList.add('text-green-400', 'border-green-400', 'opacity-100');
        btn.classList.remove('text-[var(--accent)]', 'border-[var(--border)]');

        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.classList.remove('text-green-400', 'border-green-400', 'opacity-100');
          btn.classList.add('text-[var(--accent)]', 'border-[var(--border)]');
        }, 1500);
      });
    });

    document.querySelectorAll('.erd-card-header').forEach(header => {
      header.addEventListener('dblclick', (e) => {
        const tName = header.parentElement.getAttribute('data-table');
        document.getElementById('btn-close-erd').click();
        openTableInDataGrid(tName);
      });
    });

    const erdCanvas = document.getElementById('erd-canvas');
    erdCanvas.addEventListener('mouseover', (e) => {
      const fkRow = e.target.closest('.fk-row[data-fk]');
      if (!fkRow) return;

      const target1 = fkRow.getAttribute('data-fk');
      const target2 = fkRow.getAttribute('data-fk-plural');
      const isNullable = fkRow.getAttribute('data-nullable') === 'true';
      const isUnique = fkRow.getAttribute('data-unique') === 'true';
      const isPhysical = fkRow.getAttribute('data-physical') === 'true';

      document.getElementById('erd-lines-group').innerHTML = '';

      const srcCard = fkRow.closest('.erd-card');

      srcCard.style.boxShadow = '0 0 30px var(--accent)';
      srcCard.style.borderColor = 'var(--accent)';
      srcCard.style.zIndex = '50';

      document.querySelectorAll('.erd-card').forEach(card => {
        const tName = card.getAttribute('data-table');
        if (tName === target1 || tName === target2) {
          card.style.boxShadow = '0 0 30px var(--accent)';
          card.style.borderColor = 'var(--accent)';
          card.style.transform = 'scale(1.05)';
          card.style.zIndex = '50';

          drawLineBetween(fkRow, target1, target2, isNullable, isUnique, isPhysical, true);

        } else if (card !== srcCard) {
          card.style.opacity = '0.2';
        }
      });
    });

    erdCanvas.addEventListener('mouseout', (e) => {
      const fkRow = e.target.closest('.fk-row[data-fk]');
      if (!fkRow) return;

      document.getElementById('erd-lines-group').innerHTML = '';

      document.querySelectorAll('.erd-card').forEach(card => {
        card.style.boxShadow = ''; card.style.borderColor = ''; card.style.transform = ''; card.style.opacity = '1'; card.style.zIndex = card.dataset.savedZ || '';
      });
    });

    let draggedCard = null;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
    let topZIndex = 100;

    function bringToFront(card) {
      topZIndex++;
      card.style.zIndex = topZIndex;
    }

    document.querySelectorAll('.erd-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        if (!draggedCard) card.style.zIndex = topZIndex + 1;
      });

      card.addEventListener('mouseleave', () => {
        if (!draggedCard && card.style.zIndex == topZIndex + 1) {
          card.style.zIndex = card.dataset.savedZ || '';
        }
      });

      const header = card.querySelector('.erd-card-header');
      if (header) {
        header.addEventListener('mousedown', (e) => {
          if (e.target.tagName.toLowerCase() === 'button') return;
          draggedCard = card;
          startX = e.clientX;
          startY = e.clientY;
          initialLeft = parseInt(draggedCard.style.left || 0, 10);
          initialTop = parseInt(draggedCard.style.top || 0, 10);

          bringToFront(draggedCard);
          draggedCard.dataset.savedZ = topZIndex;

          e.preventDefault();
        });
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!draggedCard) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      draggedCard.style.left = (initialLeft + dx) + 'px';
      draggedCard.style.top = (initialTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (draggedCard) {
        const db_id = document.getElementById('db-select')?.value || localStorage.getItem('ide_target_db');
        let savedPos = JSON.parse(localStorage.getItem(`erd_pos_${db_id}`)) || {};

        const tName = draggedCard.getAttribute('data-table');
        savedPos[tName] = {
          x: parseInt(draggedCard.style.left, 10),
          y: parseInt(draggedCard.style.top, 10),
          z: topZIndex
        };
        localStorage.setItem(`erd_pos_${db_id}`, JSON.stringify(savedPos));
        draggedCard = null;
      }
    });
  }
}
