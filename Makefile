.DEFAULT_GOAL := help
GREEN  := $(shell tput -Txterm setaf 2 2>/dev/null || echo '')
YELLOW := $(shell tput -Txterm setaf 3 2>/dev/null || echo '')
RESET  := $(shell tput -Txterm sgr0 2>/dev/null || echo '')

PORT_BROWSER  := 3000
PORT_ADMINER  := 8080

# ==========================================
# OS Специфічні змінні (Docker, Browser, VENV)
# ==========================================
ifeq ($(OS),Windows_NT)
    DOCKER_START_CMD := start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    WAIT_DOCKER := powershell -Command "do { Write-Host 'Чекаю на Docker...'; Start-Sleep -Seconds 2 } while (!(docker info 2>$$null))"
    OPEN_BROWSER := start http://127.0.0.1:$(PORT_BROWSER)
    OPEN_ADMINER := start http://127.0.0.1:$(PORT_ADMINER)
    VENV_PYTHON := .venv\Scripts\python
else ifeq ($(shell uname),Darwin)
    DOCKER_START_CMD := open -a Docker
    WAIT_DOCKER := until docker info >/dev/null 2>&1; do echo "Чекаю на Docker..."; sleep 3; done
    OPEN_BROWSER := open http://127.0.0.1:$(PORT_BROWSER)
    OPEN_ADMINER := open http://127.0.0.1:$(PORT_ADMINER)
    VENV_PYTHON := .venv/bin/python
else
    DOCKER_START_CMD := systemctl start docker
    WAIT_DOCKER := until docker info >/dev/null 2>&1; do echo "Чекаю на Docker..."; sleep 3; done
    OPEN_BROWSER := xdg-open http://127.0.0.1:$(PORT_BROWSER) &> /dev/null || true
    OPEN_ADMINER := xdg-open http://127.0.0.1:$(PORT_ADMINER) &> /dev/null || true
    VENV_PYTHON := .venv/bin/python
endif

# Оголошуємо ВСІ команди як не-файли (захист від конфліктів з папками)
.PHONY: help ensure-docker start frontend backend down logs db-manage db-adminer db-add db-rm db-list db-dump db-restore update-libs build clean

# ==========================================
# БАЗОВІ ПЕРЕВІРКИ ТА СЕРЕДОВИЩЕ
# ==========================================
ensure-docker:
	@docker info >/dev/null 2>&1 || (echo "$(YELLOW)Docker не запущено. Ініціюю автозапуск...$(RESET)" && $(DOCKER_START_CMD) && $(WAIT_DOCKER) && echo "$(GREEN)✅ Docker готовий до роботи!$(RESET)")

# Автоматичне створення .venv, якщо його немає
.venv:
	@echo "$(YELLOW)📦 Ініціалізація ізольованого середовища .venv...$(RESET)"
	python3 -m venv .venv || python -m venv .venv

# Змінна для фонового виконання (без інтерактиву)
DB_MANAGER = docker compose exec -T api python backend/db_manager.py

help: ## Показати це меню
	@echo "$(GREEN)GOD MODE SQL STAND CONSOLE$(RESET)"
	@awk 'BEGIN {FS = ":.*##"}; /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(YELLOW)%-20s$(RESET) %s\n", $$1, $$2 }; /^##@/ { printf "\n$(GREEN)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ 🚀 Запуск проекту
start: backend ## Запустити ВЕСЬ проект (Backend + Frontend + Browser)
	@echo "$(GREEN)Відкриваю IDE у браузері...$(RESET)"
	@$(OPEN_BROWSER)
	@$(MAKE) frontend

frontend: .venv update-libs ## Запустити тільки Frontend (через .venv)
	@echo "$(GREEN)🌐 Запуск Frontend-сервера на порту $(PORT_BROWSER) через .venv... (Ctrl+C для зупинки)$(RESET)"
	$(VENV_PYTHON) -m http.server $(PORT_BROWSER) --directory frontend --bind 127.0.0.1

backend: ensure-docker ## Підняти тільки Backend (API та Adminer)
	docker compose up -d --build

##@ ⚙️ Управління ядром
down: ensure-docker ## Зупинити Backend
	docker compose down

logs: ensure-docker ## Перегляд логів API
	docker compose logs -f api

##@ 🗄️ Фабрика Баз Даних
db-manage: ensure-docker ## Інтерактивне управління БД через CLI
	@echo "$(GREEN)Вхід в інтерактивний менеджер баз даних...$(RESET)"
	docker compose exec api python backend/db_manager.py

db-adminer: ## Відкрити Adminer у браузері (Резервне управління БД)
	@echo "$(YELLOW)Відкриваю Adminer на порту $(PORT_ADMINER)...$(RESET)"
	@$(OPEN_ADMINER)

db-add: ensure-docker ## Додати БД (make db-add engine=postgres version=16)
	@if [ "$(engine)" = "" ]; then \
		$(DB_MANAGER) add; \
	else \
		$(DB_MANAGER) add $(engine) $(version); \
	fi

db-rm: ensure-docker ## Видалити БД (make db-rm id=rdb_postgres_1234)
	@$(DB_MANAGER) rm $(id)

db-list: ensure-docker ## Список активних баз
	@$(DB_MANAGER) list

db-dump: ensure-docker ## Зробити SQL-дамп БД (make db-dump id=rdb_postgres_1234)
	@if [ "$(id)" = "" ]; then echo "$(YELLOW)Вкажіть ID бази: make db-dump id=...$(RESET)"; else $(DB_MANAGER) dump $(id); fi

db-restore: ensure-docker ## Відновити БД з дампу (make db-restore id=... file=...)
	@if [ "$(id)" = "" ] || [ "$(file)" = "" ]; then echo "$(YELLOW)Вкажіть ID та файл: make db-restore id=... file=backup.sql$(RESET)"; else $(DB_MANAGER) restore $(id) $(file); fi

##@ 🌍 Офлайн Залежності
update-libs: .venv ## Завантажити сторонні JS-бібліотеки локально (для автономної роботи)
	@echo "$(YELLOW)📥 Завантаження автономних бібліотек у libs/...$(RESET)"
	@$(VENV_PYTHON) -c "import os; os.makedirs('frontend/js/libs', exist_ok=True)"
	@curl -s -L -o frontend/js/libs/sql-formatter.min.js https://cdn.jsdelivr.net/npm/sql-formatter@15.3.2/dist/sql-formatter.min.js
	@curl -s -L -o frontend/js/libs/html-to-image.min.js https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js
	@echo "$(GREEN)✅ Бібліотеки готові до офлайн-використання!$(RESET)"

##@ 📦 Утиліти
build: .venv update-libs ## Зібрати весь проєкт в один HTML-файл для здачі (hw_submission.html)
	@echo "$(YELLOW)🏗️ Починаю збірку проєкту в єдиний файл...$(RESET)"
	$(VENV_PYTHON) builder.py
	@echo "$(GREEN)✅ Успішно! Згенеровано файл: hw_submission.html$(RESET)"
	@echo "$(GREEN)Ви можете відкрити його в браузері напряму (без сервера) для перевірки.$(RESET)"

clean: ensure-docker ## Жорстке очищення системи (API + всі бази)
	@echo "$(YELLOW)🧹 Видалення всіх згенерованих баз даних...$(RESET)"
	@CONTAINERS=$$(docker ps -a -q --filter "name=rdb_"); if [ -n "$$CONTAINERS" ]; then docker rm -f $$CONTAINERS; fi
	@echo "$(YELLOW)🧨 Знищення ядра API та мережі...$(RESET)"
	@docker compose down -v --remove-orphans
	@rm -f databases.json
	@rm -rf dist/
	@rm -rf .venv/
	@echo "$(GREEN)✅ Стенд дезінтегровано. Абсолютно чистий аркуш!$(RESET)"
