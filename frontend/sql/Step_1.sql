-- ===================================================
-- КРОК 1: Витягування року, місяця та числа з дати
-- ===================================================

USE goit_rdb_hw04;

SELECT
    id,
    date,
    YEAR(date) AS order_year,
    -- Додаємо '0' зліва, якщо число однозначне (наприклад, 07 замість 7)
    LPAD(MONTH(date), 2, '0') AS order_month_padded,
    LPAD(DAY(date), 2, '0') AS order_day_padded
FROM orders;
