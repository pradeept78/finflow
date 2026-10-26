-- Lets a credit card Spend or EMI be tagged as really being for someone else (e.g. you put a
-- friend's purchase on your card) so it can be tracked as money they owe you back, separately
-- from the card's real outstanding balance (which the bank still charges to you either way).
-- Nullable/default-false and additive only — every existing spend/EMI is untagged by default.
ALTER TABLE card_spends
    ADD COLUMN owed_by VARCHAR(100) NULL,
    ADD COLUMN owed_settled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE card_emis
    ADD COLUMN owed_by VARCHAR(100) NULL,
    ADD COLUMN owed_settled BOOLEAN NOT NULL DEFAULT FALSE;
