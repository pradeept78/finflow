-- Manual debt-linking: lets a statement transaction be pointed at a specific Loan, CreditCard, or
-- ClosedLoan when auto-matching (see the Debt Matching page) can't find it on name/amount alone.
-- Nullable and additive only — every existing transaction is unlinked by default, nothing else
-- changes.
--
-- Single-column model: one transaction links to at most one debt, identified by a type discriminator
-- (LOAN/CARD/CLOSED) plus its id. No FK constraint on linked_debt_id — it can point into the loans,
-- credit_cards, or closed_loans table depending on linked_debt_type, and all of those rows can be
-- deleted/archived independently of this transaction (e.g. a loan gets closed and archived to
-- closed_loans), so a hard FK would either block that or need to cascade in a way that silently
-- un-links history. The application layer is the source of truth for which table linked_debt_id
-- refers to.
ALTER TABLE transactions
    ADD COLUMN linked_debt_type VARCHAR(10) NULL,
    ADD COLUMN linked_debt_id BIGINT NULL;

CREATE INDEX idx_txn_linked_debt ON transactions (linked_debt_type, linked_debt_id);
