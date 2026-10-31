-- Which statement a card's typed Outstanding belongs to: the date it was entered. The statement is the
-- latest one on or before this date (frontend utils/cardCycle.ts). Without it, a balance typed just
-- before the statement day was taken for the NEXT statement and moved a month later.
ALTER TABLE credit_cards ADD COLUMN outstanding_as_of DATE NULL;

-- Existing balances: the best evidence of when they were typed is the row's last update.
UPDATE credit_cards SET outstanding_as_of = DATE(COALESCE(updated_at, created_at))
 WHERE outstanding IS NOT NULL AND outstanding > 0;
