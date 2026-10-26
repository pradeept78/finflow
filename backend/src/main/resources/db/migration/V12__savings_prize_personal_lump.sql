-- V12: Add prize_taken, prize_month to savings; is_lump_sum to personal_emis

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE savings ADD COLUMN prize_taken TINYINT(1) DEFAULT 0', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='savings' AND column_name='prize_taken');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE savings ADD COLUMN prize_month INT DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='savings' AND column_name='prize_month');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Add new fields to closed_loans for true P&L tracking
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE closed_loans ADD COLUMN interest_paid DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='closed_loans' AND column_name='interest_paid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE closed_loans ADD COLUMN principal_paid DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='closed_loans' AND column_name='principal_paid');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE closed_loans ADD COLUMN original_value DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='closed_loans' AND column_name='original_value');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE closed_loans ADD COLUMN closed_months INT DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='closed_loans' AND column_name='closed_months');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add salary growth fields to income_entries
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE income_entries ADD COLUMN next_increment_date DATE DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='income_entries' AND column_name='next_increment_date');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE income_entries ADD COLUMN next_increment_pct DECIMAL(5,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='income_entries' AND column_name='next_increment_pct');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
