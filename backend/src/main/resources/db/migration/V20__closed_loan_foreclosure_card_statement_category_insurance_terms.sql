-- V20: Several forms collect fields that Jackson silently drops on save because the matching
-- entity column never existed (fail-on-unknown-properties=false) — same class of bug as V19's
-- closed_loans.emi:
--   * closed_loans.foreclosure_amt  — "Foreclosure Amount" input on the Add/Edit Entry form
--   * card_spends.category          — "Category" select on the Add Spend form
--   * insurance_policies.insurer          — "Insurer / Provider" input
--   * insurance_policies.term_years       — "Policy Term (years)" input
--   * insurance_policies.payment_term_years — "Payment Term (years)" input
--
-- Note: credit_cards.billing_day needed no migration — that column has existed since
-- V1__init_schema.sql, it was just never mapped onto CreditCard.java (fixed in the entity only).

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE closed_loans ADD COLUMN foreclosure_amt DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='closed_loans' AND column_name='foreclosure_amt');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE card_spends ADD COLUMN category VARCHAR(50) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='card_spends' AND column_name='category');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE insurance_policies ADD COLUMN insurer VARCHAR(100) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='insurance_policies' AND column_name='insurer');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE insurance_policies ADD COLUMN term_years INT DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='insurance_policies' AND column_name='term_years');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE insurance_policies ADD COLUMN payment_term_years INT DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='insurance_policies' AND column_name='payment_term_years');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
