# Використовуємо сучасний та швидкий Python 3.13
FROM python:3.13-slim

# Встановлюємо робочу директорію
WORKDIR /app

# 1. Встановлюємо системні залежності для компіляції драйверів.
# gcc, g++ - базові компілятори
# libpq-dev - потрібно для psycopg2 (PostgreSQL)
# freetds-dev - КРИТИЧНО потрібно для збірки pymssql (MSSQL)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    freetds-dev \
    && rm -rf /var/lib/apt/lists/*

# Копіюємо файл із залежностями та встановлюємо їх
COPY requirements.txt .

# 2. Оновлюємо базові інструменти збірки перед встановленням пакетів
RUN pip install --no-cache-dir --upgrade pip setuptools wheel cython

# 3. Встановлюємо всі наші драйвери та FastAPI
RUN pip install --no-cache-dir -r requirements.txt

# Копіюємо весь інший код у контейнер
COPY . .

EXPOSE 8000

# Запускаємо FastAPI сервер через Uvicorn з підтримкою hot-reload
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
