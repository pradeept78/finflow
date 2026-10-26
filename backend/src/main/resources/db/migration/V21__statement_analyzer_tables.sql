-- V21: Merge in the Statement Analyzer app's tables (bank/card statement import + spend/income
-- analytics). That app was previously a separate, passwordless, single-tenant service (isolation
-- was only an "X-Profile" request header — anyone could hit the API as any profile). Every account
-- and transaction now belongs to a real finflow-clean user via user_id, matching the entities in
-- com.finflow.analyzer.model.Account / Transaction. `profile` is kept only as an optional cosmetic
-- sub-label *within* one user's own data (e.g. "Default"/"Business"), not a security boundary.

CREATE TABLE IF NOT EXISTS accounts (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    bank_name    VARCHAR(100) NOT NULL,
    account_type VARCHAR(30) NOT NULL,
    masked_number VARCHAR(30) NOT NULL,
    display_name VARCHAR(220) NOT NULL,
    account_key  VARCHAR(180) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_account_user_key UNIQUE (user_id, account_key)
);

CREATE TABLE IF NOT EXISTS transactions (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    transaction_date    DATE,
    description         VARCHAR(1000),
    merchant            VARCHAR(500),
    amount              DECIMAL(19,2),
    direction           VARCHAR(20),
    category            VARCHAR(100),
    sub_category        VARCHAR(100),
    transaction_type    VARCHAR(40),
    account             VARCHAR(150),
    profile             VARCHAR(100),
    source_file         VARCHAR(100),
    fingerprint         VARCHAR(200),
    recurring           BOOLEAN NOT NULL DEFAULT FALSE,
    excluded_from_spend BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_txn_date ON transactions (transaction_date);
CREATE INDEX idx_txn_category ON transactions (category);
CREATE UNIQUE INDEX idx_txn_user_fingerprint ON transactions (user_id, fingerprint);
CREATE INDEX idx_txn_account ON transactions (account);
CREATE INDEX idx_txn_user ON transactions (user_id);
