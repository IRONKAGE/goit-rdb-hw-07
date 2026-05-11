import sys
import os
import re
from pathlib import Path

def inline_css(html_content, frontend_dir):
    """Шукає локальні CSS файли в папці frontend і вбудовує їх в HTML"""
    def replacer(match):
        css_path = frontend_dir / match.group(1)
        if css_path.exists():
            with open(css_path, 'r', encoding='utf-8') as f:
                return f"<style>\n{f.read()}\n</style>"
        return match.group(0)

    return re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', replacer, html_content)

def bundle_js(frontend_dir, sql_content):
    """Шукає всі JS файли у frontend/, прибирає import/export, ін'єктує SQL і зливає в один блок"""

    # 1. Читаємо конфіг та активуємо STANDALONE
    config_code = ""
    config_path = frontend_dir / "js" / "config.js"
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            content = f.read()
            config_code = content.replace("export default", "const config =").replace("IS_STANDALONE: false", "IS_STANDALONE: true")

    # 2. Читаємо локалізації
    locales_code = ""
    loc_path = frontend_dir / "locales"
    if loc_path.exists():
        for file in loc_path.glob("*.js"):
            with open(file, 'r', encoding='utf-8') as f:
                var_name = file.stem
                locales_code += f.read().replace("export default", f"const {var_name} =") + "\n"

    # 3. Читаємо всі компоненти
    components_code = ""
    comp_path = frontend_dir / "js" / "components"
    if comp_path.exists():
        files = sorted(comp_path.glob("*.js"))
        for file in files:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
                content = re.sub(r'^import .*;\n', '', content, flags=re.MULTILINE)
                content = content.replace("export function", "function")
                components_code += f"// --- Component: {file.name} ---\n{content}\n"

    # 4. Читаємо core.js
    core_code = ""
    core_path = frontend_dir / "js" / "core.js"
    if core_path.exists():
        with open(core_path, 'r', encoding='utf-8') as f:
            content = f.read()
            content = re.sub(r'^import .*;\n', '', content, flags=re.MULTILINE)
            core_code = f"""
// --- Core Initialization ---
const translations = {{ uk, en }};
(async function initApp() {{
{content.replace('await new Promise', 'await new Promise')}
}})();
"""

    # 5. Зливаємо все разом + ДОДАЄМО СТАРИЙ ДОБРИЙ INIT_SQL
    bundled_script = f"""
<script>
// --- INJECTED DATA ---
window.INJECTED_INIT_SQL = `{sql_content}`;

// --- AUTOMATICALLY BUNDLED JS ---
{config_code}
{locales_code}
{components_code}
{core_code}
</script>
"""
    return bundled_script

def build_standalone_html(sql_file_path):
    root_dir = Path.cwd()
    frontend_dir = root_dir / "frontend"
    index_path = frontend_dir / "index.html"
    output_path = root_dir / "hw_submission.html"

    if not index_path.exists():
        print(f"❌ Помилка: Не знайдено {index_path}. Переконайтеся, що папка frontend існує.")
        return

    # Читаємо SQL файл і екрануємо його (як у твоєму старому скрипті)
    sql_content = ""
    if os.path.exists(sql_file_path):
        with open(sql_file_path, 'r', encoding='utf-8') as f:
            sql_content = f.read().replace("`", "\\`").replace("${", "\\${")
        print(f"📥 Знайдено SQL файл: {sql_file_path}")
    else:
        print(f"⚠️ SQL файл {sql_file_path} не знайдено. Буде використано пустий шаблон.")

    print("Читаю frontend/index.html...")
    with open(index_path, 'r', encoding='utf-8') as f:
        html = f.read()

    print("Вбудовую CSS...")
    html = inline_css(html, frontend_dir)

    print("Вирізаю підключення js/core.js...")
    html = re.sub(r'<script\s+type="module"\s+src="js/core\.js"></script>', '', html)

    print("Бандлю JS модулі та вливаю SQL...")
    bundled_js = bundle_js(frontend_dir, sql_content)

    print("Вставляю JS перед </body>...")
    html = html.replace('</body>', f"{bundled_js}\n</body>")

    print(f"Зберігаю результат у {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"📦 Створено фінальний застосунок: {output_path}")

if __name__ == "__main__":
    target_sql = sys.argv[1] if len(sys.argv) > 1 else "sql/default.sql"
    build_standalone_html(target_sql)
