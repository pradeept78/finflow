-- V6: Add interest_rate, card_emis missed_months, people_owe paid_amount
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE loans ADD COLUMN interest_rate DECIMAL(5,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loans' AND column_name='interest_rate');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE card_emis ADD COLUMN missed_months INT DEFAULT 0', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='card_emis' AND column_name='missed_months');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE people_owe ADD COLUMN paid_amount DECIMAL(15,2) DEFAULT 0', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='people_owe' AND column_name='paid_amount');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
