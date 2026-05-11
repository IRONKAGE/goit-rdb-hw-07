import uk from '../locales/uk.js';
import en from '../locales/en.js';

const translations = { uk, en };

// 💡 ПОКРАЩЕННЯ 2: Синхронізуємо початковий стан з пам'яттю браузера
let currentLang = localStorage.getItem('ide_lang') || 'uk';

export function initLogger(containerId) {
  const container = document.getElementById(containerId);
  const t = translations[currentLang];

  container.innerHTML = `
        <div id="logs-content" class="w-[95%] code-block p-3 overflow-y-auto font-mono rounded-lg"></div>
        <div class="w-[5%] flex flex-col gap-1">
            <button id="btn-copy-logs" class="btn-base h-1/2 flex items-center justify-center !p-0 rounded-lg text-[var(--text)]" title="${t.copy_logs}">📋</button>
            <button id="btn-clear-logs" class="btn-base h-1/2 flex items-center justify-center !p-0 rounded-lg text-red-500" title="${t.clear_logs}">🗑️</button>
        </div>
    `;

  // Логіка очищення
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('logs-content').innerHTML = ``;
  });

  // Логіка копіювання
  document.getElementById('btn-copy-logs').addEventListener('click', () => {
    const logText = document.getElementById('logs-content').innerText.trim();
    if (logText) {
      navigator.clipboard.writeText(logText);
      writeLog(translations[currentLang].logs_copied, "text-[var(--accent)] font-bold");
    }
  });

  // Слухаємо глобальну подію зміни мови (з 1_WorkspaceHeader.js)
  document.addEventListener('lang-changed', (e) => {
    currentLang = e.detail;
    const newT = translations[currentLang];

    document.getElementById('btn-copy-logs').title = newT.copy_logs;
    document.getElementById('btn-clear-logs').title = newT.clear_logs;
  });
}

// 💡 ПОКРАЩЕННЯ 1: Оптимізація рендеру (без перемальовування всього DOM)
export function writeLog(message, cssClass = "log-default") {
  const el = document.getElementById('logs-content');
  if (el) {
    const logEntry = `<div class="${cssClass} py-0.5 border-b border-[var(--border)]/50">> ${message}</div>`;
    el.insertAdjacentHTML('beforeend', logEntry);
    el.scrollTop = el.scrollHeight; // Автоскрол донизу
  }
}
