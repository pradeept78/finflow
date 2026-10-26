-- V13: Add prepaid_amount and prepaid_note to loans

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE loans ADD COLUMN prepaid_amount DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loans' AND column_name='prepaid_amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE loans ADD COLUMN prepaid_note VARCHAR(200) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loans' AND column_name='prepaid_note');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
