-- ===================================================
-- КРОК 3: Відображення кількості секунд (Timestamp)
-- ===================================================

USE goit_rdb_hw04;

SELECT
    id,
    date,
    UNIX_TIMESTAMP(date) AS date_timestamp
FROM orders;
