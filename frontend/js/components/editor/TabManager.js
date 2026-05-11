import config from '../../config.js';

export class TabManager {
  constructor(containerId, onTabSwitch, getTranslations) {
    this.container = document.getElementById(containerId);
    this.onTabSwitch = onTabSwitch;
    this.getT = getTranslations;

    this.colors = [
      '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
      '#06b6d4', '#d946ef', '#f43f5e', '#0ea5e9', '#10b981'
    ];

    this.init();
  }

  async init() {
    const saved = localStorage.getItem('ide_workspace_state');
    if (saved) {
      this.state = JSON.parse(saved);
      this.render();
      this.onTabSwitch(this.getInitialContent());
    } else {
      await this.loadInitialWorkspace();
    }
    this.bindGlobalEvents();
  }

  async loadInitialWorkspace() {
    this.state = { activeTabId: 1, nextId: 6, tabs: [] };
    const STEPS_COUNT = 5;
    const t = this.getT(); // Отримуємо поточну мову

    for (let i = 1; i <= STEPS_COUNT; i++) {
      let content = `-- ⏳ ${t.dg_loading || 'Завантаження'} Step_${i}.sql...\n`;

      if (config.IS_STANDALONE && window.INJECTED_INIT_SQL && i === 1) {
        content = window.INJECTED_INIT_SQL;
      } else {
        try {
          const r = await fetch(`./sql/Step_${i}.sql`);
          if (r.ok) content = await r.text();
          // 💡 ВІДРЕФАКТОРЕНО: Локалізація помилок
          else content = `-- ${t.qe_file_missing || 'Файл'} Step_${i}.sql ${t.qe_missing || 'відсутній'}\n`;
        } catch (e) {
          // 💡 ВІДРЕФАКТОРЕНО: Локалізація помилок
          content = `-- ${t.qe_load_error || 'Помилка завантаження'} Step_${i}.sql\n`;
        }
      }

      this.state.tabs.push({
        id: i,
        colorIndex: (i - 1) % this.colors.length,
        content: content
      });
    }

    this.saveState();
    this.render();
    this.onTabSwitch(this.getInitialContent());
  }

  saveState() {
    localStorage.setItem('ide_workspace_state', JSON.stringify(this.state));
  }

  updateCurrentContent(content) {
    const tab = this.state.tabs.find(t => t.id === this.state.activeTabId);
    if (tab && tab.content !== content) {
      tab.content = content;
      this.saveState();
    }
  }

  addTab() {
    if (this.state.tabs.length >= 15) return;
    const newTabId = this.state.nextId++;
    const t = this.getT(); // Отримуємо поточну мову

    this.state.tabs.push({
      id: newTabId,
      colorIndex: (newTabId - 1) % this.colors.length,
      // 💡 ВІДРЕФАКТОРЕНО: Локалізація створення
      content: `-- ${t.qe_new_query || 'Новий запит'}...\n`
    });
    this.switchTab(newTabId);
  }

  closeTab(id) {
    if (this.state.tabs.length === 1) return;
    const index = this.state.tabs.findIndex(t => t.id === id);
    this.state.tabs = this.state.tabs.filter(t => t.id !== id);

    if (this.state.activeTabId === id) {
      const newActive = this.state.tabs[Math.min(index, this.state.tabs.length - 1)];
      this.switchTab(newActive.id);
    } else {
      this.saveState();
      this.render();
    }
  }

  switchTab(id) {
    this.state.activeTabId = id;
    this.saveState();
    this.render();
    const tab = this.state.tabs.find(t => t.id === id);
    this.onTabSwitch(tab.content);
  }

  bindGlobalEvents() {
    this.container.addEventListener('dblclick', (e) => {
      if (e.target === this.container) this.addTab();
    });
  }

  render() {
    let html = '';
    const t = this.getT();

    this.state.tabs.forEach(tab => {
      const isActive = tab.id === this.state.activeTabId;
      const color = this.colors[tab.colorIndex];

      html += `
                <div data-id="${tab.id}" class="tab-item relative group cursor-pointer flex items-center gap-3 px-4 py-1.5 rounded-t-xl transition-all select-none
                    ${isActive ? 'bg-[var(--panel)] z-10' : 'bg-transparent hover:bg-[var(--text)]/5 opacity-60 hover:opacity-100'}"
                    style="${isActive ? `border-top: 2px solid ${color}; border-left: 1px solid var(--border); border-right: 1px solid var(--border); color: ${color};` : 'color: var(--text);'}">

                    <span class="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">${t.qe_step_tab || 'Step'} ${tab.id}</span>

                    ${this.state.tabs.length > 1 ? `
                    <div data-close="${tab.id}" title="${t.qe_close_tab || 'Закрити (Middle Click)'}" class="w-3.5 h-3.5 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] flex items-center justify-center transition-colors
                        ${isActive ? 'bg-[var(--bg)] hover:bg-red-500' : 'bg-[var(--border)] group-hover:bg-[var(--bg)] hover:!bg-red-500'}">
                        <span class="opacity-0 group-hover:opacity-100 text-[8px] text-white font-bold leading-none">✕</span>
                    </div>` : ''}
                </div>
            `;
    });

    if (this.state.tabs.length < 15) {
      html += `
                <div id="btn-add-tab" title="${t.qe_new_tab_tip || 'Новий запит (Dbl-Click)'}" class="relative cursor-pointer flex items-center justify-center px-4 py-1.5 rounded-t-xl border border-dashed border-[var(--border)] text-[var(--log-text)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all ml-1 select-none">
                    <span class="text-[14px] font-bold leading-none">+</span>
                </div>
            `;
    }

    this.container.innerHTML = html;

    this.container.querySelectorAll('.tab-item').forEach(el => {
      const id = parseInt(el.dataset.id);
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-close]') && id !== this.state.activeTabId) this.switchTab(id);
      });
      el.addEventListener('auxclick', (e) => {
        if (e.button === 1) this.closeTab(id);
      });
    });

    this.container.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(parseInt(e.currentTarget.dataset.close));
      });
    });

    const addBtn = this.container.querySelector('#btn-add-tab');
    if (addBtn) addBtn.addEventListener('click', () => this.addTab());
  }

  getInitialContent() {
    const tab = this.state.tabs.find(t => t.id === this.state.activeTabId) || this.state.tabs[0];
    return tab ? tab.content : '';
  }
}
