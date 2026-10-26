-- V19: closed_loans has never had an `emi` column, despite the frontend's Add/Edit Entry form
-- (ClosedLoansPage.tsx) collecting a "Monthly EMI" value and several calculations reading it back
-- (deriveInt's EMI x months interest fallback, verdict()'s _emi). Every save silently dropped the
-- value — Spring Boot's Jackson defaults to fail-on-unknown-properties=false, so an unmapped field
-- in the request body is ignored rather than rejected, which is why this looked like "saved but
-- not populated" instead of an outright error.

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE closed_loans ADD COLUMN emi DECIMAL(15,2) DEFAULT NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='closed_loans' AND column_name='emi');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
