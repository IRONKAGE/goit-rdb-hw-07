import { initWorkspaceHeader } from './1_WorkspaceHeader.js';
import { initQueryEditor } from './2_QueryEditor.js';
import { initDataGrid } from './3_DataGrid.js';
import { initSchemaInspector } from './4_SchemaInspector.js';
import { initLogger, writeLog } from './5_ConsoleLogger.js';
import { initSnippetEngine } from './6_SnippetEngine.js';

export class UIController {
  constructor(config) {
    this.config = config;
    this.state = {
      theme: localStorage.getItem('ide_theme') || 'dracula',
      lang: localStorage.getItem('ide_lang') || 'uk',
      targetDb: localStorage.getItem('ide_target_db') || null
    };
  }

  async init() {
    // 1. Спочатку піднімаємо Логер
    initLogger('console-logger');
    writeLog(`⚙️ [BOOT] Система ініціалізована. Project: ${this.config.PROJECT_NAME}`, 'text-emerald-500');

    this.applyTheme(this.state.theme);

    try {
      // 2. Ініціалізуємо всі суб-модулі
      initWorkspaceHeader('workspace-header', this.config);
      initQueryEditor('query-editor');
      initDataGrid('data-grid');
      initSchemaInspector('schema-inspector');
      initSnippetEngine('snippet-engine');

      // 3. Підключаємо Шину Подій (Event Bus)
      this.bindGlobalEvents();

      writeLog('✅ [BOOT] Оркестратор успішно зв\'язав усі модулі.', 'text-blue-400');

    } catch (error) {
      writeLog(`❌ [FATAL] Збій завантаження UI: ${error.message}`, 'text-red-500 font-bold');
      console.error(error);
    }
  }

  bindGlobalEvents() {
    document.addEventListener('lang-changed', (e) => {
      this.state.lang = e.detail;
      localStorage.setItem('ide_lang', this.state.lang);
    });

    document.addEventListener('theme-changed', (e) => {
      this.state.theme = e.detail;
      localStorage.setItem('ide_theme', this.state.theme);
      this.applyTheme(this.state.theme);
    });

    document.addEventListener('db-changed', (e) => {
      // Зберігаємо останню обрану базу, щоб при оновленні сторінки вона підтягнулась
      const dbId = e.detail.id || e.detail;
      this.state.targetDb = dbId;
      localStorage.setItem('ide_target_db', this.state.targetDb);
      writeLog(`🗄️ Підключення встановлено: ${this.state.targetDb}`, 'text-[var(--accent)] font-bold');
    });
  }

  applyTheme(themeName) {
    document.body.classList.remove('theme-dracula', 'theme-alucard');
    document.body.classList.add(`theme-${themeName}`);
  }
}

// Функція для старту
export function bootstrapIDE(config) {
  const app = new UIController(config);
  app.init();
}
