-- Bank message reader. A card's / loan's last 4 digits are how an SMS ("Card XX4521", "Loan A/c XX1234")
-- is matched to it. users.ingest_key_hash is the SHA-256 of the personal key the iPhone Shortcut sends
-- (the key itself is shown once and never stored).
ALTER TABLE credit_cards ADD COLUMN last4 VARCHAR(4) NULL;
ALTER TABLE loans ADD COLUMN last4 VARCHAR(4) NULL;
ALTER TABLE users ADD COLUMN ingest_key_hash CHAR(64) NULL;

-- One row per message received. Nothing here changes money until the user confirms it
-- (status NEW → CONFIRMED, which adds the spend / ticks the EMI / sets the bill), or IGNORED.
CREATE TABLE bank_messages (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT       NOT NULL,
    source      VARCHAR(10)  NOT NULL,
    sender      VARCHAR(40)  NULL,
    body        VARCHAR(1000) NOT NULL,
    body_hash   CHAR(64)     NOT NULL,
    received_at DATETIME     NOT NULL,
    kind        VARCHAR(20)  NOT NULL,
    amount      DECIMAL(15,2) NULL,
    last4       VARCHAR(4)   NULL,
    merchant    VARCHAR(60)  NULL,
    txn_date    DATE         NULL,
    due_date    DATE         NULL,
    min_due     DECIMAL(15,2) NULL,
    tenure      INT          NULL,
    emi_amount  DECIMAL(15,2) NULL,
    note        VARCHAR(200) NULL,
    target_type VARCHAR(10)  NULL,
    target_id   BIGINT       NULL,
    sure        BOOLEAN      NOT NULL DEFAULT FALSE,
    status      VARCHAR(10)  NOT NULL,
    result_note VARCHAR(200) NULL,
    created_at  DATETIME     NOT NULL,
    CONSTRAINT uk_bank_messages_user_hash UNIQUE (user_id, body_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_bank_messages_user_status ON bank_messages(user_id, status);
