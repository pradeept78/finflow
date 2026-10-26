-- V5: Add missed_months to loans
SET @s = (SELECT IF(
  COUNT(*) = 0,
  'ALTER TABLE loans ADD COLUMN missed_months INT DEFAULT 0',
  'SELECT 1'
) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loans' AND column_name='missed_months');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
