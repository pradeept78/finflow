-- Sure bank messages (matched by last 4 digits, clear amount) are added without a tap, with Undo.
-- On by default; each user can turn it off on the Bank messages page.
ALTER TABLE users ADD COLUMN auto_add_messages BOOLEAN NOT NULL DEFAULT TRUE;
-- auto_added: added without a tap. result_ref: what confirming created or changed, so Undo can reverse
-- exactly that (e.g. "spend:123", "emi:45", "paid:loan-3@2026-11", "bill:7:84200.00:2026-10-03:91000.00").
ALTER TABLE bank_messages ADD COLUMN auto_added BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bank_messages ADD COLUMN result_ref VARCHAR(200) NULL;
