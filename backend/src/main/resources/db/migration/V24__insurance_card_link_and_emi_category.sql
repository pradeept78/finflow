-- V24: Two forms collect fields that Jackson silently drops on save because the matching entity
-- column never existed (same class of bug as V19/V20):
--   * insurance_policies.paid_by_card_id — "Paid via Card" select on the Add/Edit Policy form
--   * insurance_policies.is_card_emi     — "Payment Mode: Card — EMI" on the same form
--   * insurance_policies.linked_emi_id   — which CardEmi row that premium maps to
--   * card_emis.category                 — "Category" select on the Add/Edit EMI form
--
-- All four are additive, nullable (or default-false), reference-only columns — no FKs, since the
-- backend never needs to load the related CreditCard/CardEmi, only store and return the id.

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE insurance_policies ADD COLUMN paid_by_card_id BIGINT DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='insurance_policies' AND column_name='paid_by_card_id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE insurance_policies ADD COLUMN is_card_emi BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='insurance_policies' AND column_name='is_card_emi');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE insurance_policies ADD COLUMN linked_emi_id BIGINT DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='insurance_policies' AND column_name='linked_emi_id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE card_emis ADD COLUMN category VARCHAR(50) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='card_emis' AND column_name='category');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
