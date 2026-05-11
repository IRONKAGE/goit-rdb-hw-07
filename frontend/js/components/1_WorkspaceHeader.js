import { writeLog } from './5_ConsoleLogger.js';
import config from '../config.js';
import uk from '../locales/uk.js';
import en from '../locales/en.js';

const translations = { uk, en };

// Зчитуємо ВСІ налаштування з пам'яті
let currentLang = localStorage.getItem('ide_lang') || 'uk';
let currentTheme = localStorage.getItem('ide_theme') || 'dracula';
let selectedDbId = localStorage.getItem('ide_target_db') || ''; // 💡 Пам'ятаємо обрану базу!
let selectedSchema = localStorage.getItem('ide_target_schema') || ''; // 💡 Пам'ятаємо обрану схему!
let activeDbs = {};

export function initWorkspaceHeader(containerId, config) {
  const container = document.getElementById(containerId);

  // Одразу фіксуємо тему, щоб не було білих спалахів
  if (currentTheme === 'alucard') {
    document.body.classList.add('theme-alucard');
    document.body.classList.remove('theme-dracula');
  }

  const t = translations[currentLang];
  const isAlucard = currentTheme === 'alucard';
  const langTitle = currentLang === 'uk' ? 'Змінити мову / Change Language' : 'Change Language / Змінити мову';

  // Вставляємо HTML з УЖЕ готовими текстами (це прибирає глюк з затримкою рендеру)
  container.innerHTML = `
        <div class="flex items-center gap-2 w-1/3">
            <div class="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)] flex-shrink-0"></div>
            <span class="font-bold tracking-widest text-[var(--accent)] text-xs mr-2">DevOpsML SQL Lab<br/>by IRONKAGE</span>

            <select id="db-select" class="input-style text-[13px] font-bold text-[var(--accent)] max-w-[200px]">
                <option value="">⏳ Очікування...</option>
            </select>

            <span class="text-[var(--border)] font-bold">/</span>

            <select id="schema-select" class="input-style text-[13px] font-bold text-[var(--text)] max-w-[200px] disabled:opacity-50" disabled>
                <option value="">⏳ Схема...</option>
            </select>
        </div>
        <div class="w-1/3 text-center">
            <span id="project-title" class="font-black tracking-[0.2em] text-[var(--text)] opacity-80 uppercase text-s">
                ${t.project}: ${config.PROJECT_NAME}
            </span>
        </div>
        <div class="w-1/3 flex justify-end items-center gap-4">
            <button id="theme-toggle" class="btn-base text-[13px] uppercase font-bold transition-colors">
                ${isAlucard ? t.theme_alucard : t.theme_dracula}
            </button>
            <button id="lang-toggle" class="text-xl hover:scale-110 transition-transform drop-shadow-md cursor-pointer" title="${langTitle}">
                ${currentLang === 'uk' ? '🇺🇦' : '🇬🇧'}
            </button>
        </div>
    `;

  const elements = {
    dbSelect: document.getElementById('db-select'),
    schemaSelect: document.getElementById('schema-select'),
    projectTitle: document.getElementById('project-title'),
    themeToggle: document.getElementById('theme-toggle'),
    langToggle: document.getElementById('lang-toggle')
  };

  const updateTexts = () => {
    const loc = translations[currentLang];
    elements.projectTitle.innerText = `${loc.project}: ${config.PROJECT_NAME}`;
    elements.themeToggle.innerText = currentTheme === 'alucard' ? loc.theme_alucard : loc.theme_dracula;
    elements.langToggle.innerText = currentLang === 'uk' ? '🇺🇦' : '🇬🇧';
    elements.langToggle.title = currentLang === 'uk' ? 'Змінити мову / Change Language' : 'Change Language / Змінити мову';
    updateDbList();
  };

  const updateDbList = () => {
    const loc = translations[currentLang];
    let dbOptions = `<option value="">${loc.no_db}</option>`;

    if (Object.keys(activeDbs).length > 0) {
      // 💡 ВИПРАВЛЕНО: тут тепер =, а не +=
      dbOptions = Object.keys(activeDbs)
        .map(id => `<option value="${id}" ${id === selectedDbId ? 'selected' : ''}>[${activeDbs[id].engine.toUpperCase()}] ${id}</option>`)
        .join('');
    }

    elements.dbSelect.innerHTML = dbOptions;
  };

  // 💡 ФУНКЦІЯ: Динамічне завантаження списку схем із сервера
  const fetchSchemasForServer = async (serverId) => {
    if (!serverId || !activeDbs[serverId]) {
      elements.schemaSelect.innerHTML = `<option value="">-- Схема --</option>`;
      elements.schemaSelect.disabled = true;
      return;
    }

    elements.schemaSelect.disabled = false;
    elements.schemaSelect.innerHTML = `<option value="">⏳ Завантаження...</option>`;

    const engine = activeDbs[serverId].engine;
    let sql = "";

    // Різні запити для різних рушіїв, щоб відфільтрувати системне сміття
    if (engine === 'mysql') {
      sql = "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys');";
    } else if (engine === 'postgres') {
      sql = "SELECT datname FROM pg_database WHERE datistemplate = false;";
    } else if (engine === 'mssql') {
      sql = "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb');";
    } else {
      sql = "SELECT schema_name FROM information_schema.schemata;"; // Fallback
    }

    try {
      const response = await fetch(`${config.API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql, db_id: serverId, god_mode: true })
      });
      const data = await response.json();

      if (response.ok && data.rows) {
        let schemaOptions = `<option value="">-- Оберіть БД --</option>`;
        // Витягуємо назви схем із результату
        const schemas = data.rows.map(row => row[0]);

        schemas.forEach(schema => {
          schemaOptions += `<option value="${schema}" ${schema === selectedSchema ? 'selected' : ''}>${schema}</option>`;
        });

        elements.schemaSelect.innerHTML = schemaOptions;

        // Якщо ми щойно завантажили схеми і маємо збережену — кажемо всім компонентам
        if (schemas.includes(selectedSchema)) {
          document.dispatchEvent(new CustomEvent('schema-selected', { detail: selectedSchema }));
        } else if (schemas.length > 0) {
          // Якщо збереженої немає, обираємо першу ліпшу
          selectedSchema = schemas[0];
          elements.schemaSelect.value = selectedSchema;
          localStorage.setItem('ide_target_schema', selectedSchema);
          document.dispatchEvent(new CustomEvent('schema-selected', { detail: selectedSchema }));
        }
      } else {
        throw new Error("No data");
      }
    } catch (e) {
      elements.schemaSelect.innerHTML = `<option value="">❌ Помилка</option>`;
      writeLog(`> Помилка завантаження списку БД: ${e.message}`, "text-red-500 font-bold");
    }
  };

  // --- СЛУХАЧІ ПОДІЙ (Ініціалізуються один раз) ---

  elements.themeToggle.addEventListener('click', () => {
    const isAlucardNow = document.body.classList.toggle('theme-alucard');
    document.body.classList.toggle('theme-dracula', !isAlucardNow);

    currentTheme = isAlucardNow ? 'alucard' : 'dracula';
    localStorage.setItem('ide_theme', currentTheme);

    updateTexts();
    writeLog(`${translations[currentLang].theme_changed} ${isAlucardNow ? translations[currentLang].theme_light : translations[currentLang].theme_dark}`, "text-[var(--accent)] font-bold");
    document.dispatchEvent(new CustomEvent('theme-changed', { detail: currentTheme }));
  });

  elements.langToggle.addEventListener('click', () => {
    currentLang = currentLang === 'uk' ? 'en' : 'uk';
    localStorage.setItem('ide_lang', currentLang);

    updateTexts();
    writeLog(translations[currentLang].lang_changed, "text-[var(--accent)] font-bold");
    document.dispatchEvent(new CustomEvent('lang-changed', { detail: currentLang }));
  });

  elements.dbSelect.addEventListener('change', (e) => {
    selectedDbId = e.target.value;
    localStorage.setItem('ide_target_db', selectedDbId); // 💡 Зберігаємо вибір

    // Скидаємо вибрану схему при зміні сервера
    selectedSchema = '';
    localStorage.removeItem('ide_target_schema');

    const dbType = selectedDbId ? activeDbs[selectedDbId].engine : 'none';
    if (selectedDbId) {
      writeLog(`> Target DB set: ${selectedDbId} [${dbType}]`, "text-[var(--accent)] font-bold");
      fetchSchemasForServer(selectedDbId); // 💡 Завантажуємо схеми для обраного сервера!
    } else {
      writeLog(`> Target DB disconnected.`, "text-red-400 font-bold");
    }

    document.dispatchEvent(new CustomEvent('db-selected', { detail: selectedDbId }));
  });

  // 💡 Зміна Схеми (БД)
  elements.schemaSelect.addEventListener('change', (e) => {
    selectedSchema = e.target.value;
    localStorage.setItem('ide_target_schema', selectedSchema);
    writeLog(`> Робоча БД змінена на: ${selectedSchema}`, "text-[var(--text)] font-bold");
    document.dispatchEvent(new CustomEvent('schema-selected', { detail: selectedSchema }));
  });

  // --- РЕАКЦІЯ НА ДАНІ З БЕКЕНДУ ---
  document.addEventListener('dbs-loaded', (e) => {
    activeDbs = e.detail;

    // Якщо раніше збережена база видалена — скидаємо вибір
    if (selectedDbId && !activeDbs[selectedDbId]) {
      selectedDbId = '';
      localStorage.removeItem('ide_target_db');
    }

    // Якщо бази завантажилися, але нічого не вибрано (перший запуск) — автовибір першої
    if (!selectedDbId && Object.keys(activeDbs).length > 0) {
      selectedDbId = Object.keys(activeDbs)[0];
      localStorage.setItem('ide_target_db', selectedDbId);
    }

    updateDbList();

    // Одразу кажемо системі (і Snippet Engine), яка база зараз активна
    if (selectedDbId) {
      document.dispatchEvent(new CustomEvent('db-selected', { detail: selectedDbId }));
      fetchSchemasForServer(selectedDbId); // 💡 Одразу вантажимо схеми для стартового сервера!
    }
  });
}
