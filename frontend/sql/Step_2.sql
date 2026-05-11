-- ===================================================
-- КРОК 2: Додавання одного дня до дати
-- ===================================================

USE goit_rdb_hw04;

SELECT
    id,
    date,
    DATE_ADD(date, INTERVAL 1 DAY) AS date_plus_one_day
FROM orders;
