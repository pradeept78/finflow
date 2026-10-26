-- V16: Add current_value to loans for asset tracking
SET @s = (SELECT IF(
  COUNT(*) = 0,
  'ALTER TABLE loans ADD COLUMN current_value DECIMAL(15,2) DEFAULT NULL',
  'SELECT 1'
) FROM information_schema.columns 
WHERE table_schema = DATABASE() 
AND table_name = 'loans' 
AND column_name = 'current_value');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
