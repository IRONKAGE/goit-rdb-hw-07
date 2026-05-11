-- ===================================================
-- КРОК 5: Створення JSON-об'єкта з атрибутів
-- ===================================================

USE goit_rdb_hw04;

SELECT
    id,
    date,
    -- Форматуємо JSON для красивого читабельного виводу завдяки JSON_PRETTY
    JSON_PRETTY(JSON_OBJECT('id', id, 'date', date)) AS json_data
FROM orders;
