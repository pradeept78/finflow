-- V18: Add debit_account, processing_fee to loans (notes column already exists from V1)
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE loans ADD COLUMN debit_account VARCHAR(150) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loans' AND column_name='debit_account');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE loans ADD COLUMN processing_fee DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='loans' AND column_name='processing_fee');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
