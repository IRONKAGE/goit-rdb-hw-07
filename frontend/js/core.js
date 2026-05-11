import config from './config.js';
import { bootstrapIDE } from './components/7_UIController.js';

// Top-level await: чекаємо готовності DOM
await new Promise(resolve => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve);
  else resolve();
});

// 1. Запускаємо наш "Мозок" (Оркестратор)
bootstrapIDE(config);

// 2. Синхронізуємо бази даних з бекендом
try {
  const res = await fetch(`${config.API_URL}/databases`);
  if (!res.ok) throw new Error("API не відповідає");
  const dbs = await res.json();

  // Сповіщаємо всі компоненти (зокрема WorkspaceHeader і SchemaInspector)
  document.dispatchEvent(new CustomEvent('dbs-loaded', { detail: dbs }));

} catch (e) {
  console.error("API недоступне. Перевірте Docker Compose.", e);
  document.dispatchEvent(new CustomEvent('log-message', {
    detail: { msg: "API недоступне. Перевірте Docker Compose.", style: "text-red-500 font-bold" }
  }));
}
