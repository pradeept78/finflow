-- FinFlow Database Schema V1 (consolidated with all columns)

CREATE TABLE IF NOT EXISTS users (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    password   VARCHAR(255) NOT NULL,
    role       VARCHAR(20) DEFAULT 'USER',
    last_login DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_cards (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    banker      VARCHAR(100) NOT NULL,
    card_limit  DECIMAL(15,2) NOT NULL DEFAULT 0,
    outstanding DECIMAL(15,2) NOT NULL DEFAULT 0,
    due_day     INT,
    billing_day INT,
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_emis (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    card_id       BIGINT NOT NULL,
    label         VARCHAR(100) NOT NULL,
    principal     DECIMAL(15,2),
    emi           DECIMAL(15,2) NOT NULL,
    tenure        INT,
    paid          INT DEFAULT 0,
    pending       INT DEFAULT 0,
    missed_months INT DEFAULT 0,
    start_date    DATE,
    end_date      DATE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_spends (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    card_id    BIGINT NOT NULL,
    purpose    VARCHAR(200) NOT NULL,
    amount     DECIMAL(15,2) NOT NULL,
    spend_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loans (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    lender        VARCHAR(100) NOT NULL,
    loan_type     VARCHAR(50) DEFAULT 'Personal Loan',
    amount        DECIMAL(15,2) DEFAULT NULL,
    emi           DECIMAL(15,2) NOT NULL,
    tenure        INT,
    paid          INT DEFAULT 0,
    pending       INT DEFAULT 0,
    pending_amt   DECIMAL(15,2) DEFAULT 0,
    due_day       INT,
    interest_rate DECIMAL(5,2) DEFAULT NULL,
    missed_months INT DEFAULT 0,
    principal_paid DECIMAL(15,2) DEFAULT NULL,
    start_date    DATE,
    end_date      DATE,
    notes         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_emis (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    person        VARCHAR(100) NOT NULL,
    amount        DECIMAL(15,2) NOT NULL,
    emi           DECIMAL(15,2) DEFAULT 0,
    tenure        INT,
    paid          INT DEFAULT 0,
    pending       INT DEFAULT 0,
    interest_rate DECIMAL(5,2) DEFAULT 0,
    due_day       INT,
    start_date    DATE,
    payback_date  DATE,
    notes         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS savings (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    saving_type     VARCHAR(50),
    mode            VARCHAR(20) DEFAULT 'saving',
    chit_value      DECIMAL(15,2),
    monthly         DECIMAL(15,2) NOT NULL,
    tenure          INT NOT NULL,
    paid_months     INT DEFAULT 0,
    missed_months   INT DEFAULT 0,
    double_payments INT DEFAULT 0,
    actual_received DECIMAL(15,2),
    prize_taken     TINYINT(1) DEFAULT 0,
    prize_month     INT DEFAULT NULL,
    start_date      DATE,
    end_date        DATE,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS investments (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT NOT NULL,
    name           VARCHAR(100) NOT NULL,
    invest_type    VARCHAR(50),
    monthly        DECIMAL(15,2) DEFAULT 0,
    start_date     DATE,
    tenure         INT,
    missed_months  INT DEFAULT 0,
    total_invested DECIMAL(15,2) DEFAULT 0,
    current_value  DECIMAL(15,2) DEFAULT 0,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS insurance_policies (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    name             VARCHAR(100) NOT NULL,
    insurer          VARCHAR(100),
    policy_type      VARCHAR(50),
    premium          DECIMAL(15,2) NOT NULL,
    frequency        VARCHAR(20) DEFAULT 'Yearly',
    start_date       DATE,
    payment_end_date DATE,
    end_date         DATE,
    sum_assured      DECIMAL(15,2),
    last_paid_date   DATE,
    notes            TEXT,
    active           BOOLEAN DEFAULT TRUE,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS income_entries (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    label       VARCHAR(100) NOT NULL,
    amount      DECIMAL(15,2) NOT NULL,
    income_type VARCHAR(50),
    frequency   VARCHAR(20) DEFAULT 'Monthly',
    start_date  DATE,
    notes       TEXT,
    active      BOOLEAN DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    label      VARCHAR(100) NOT NULL,
    amount     DECIMAL(15,2) NOT NULL,
    category   VARCHAR(50),
    frequency  VARCHAR(20) DEFAULT 'Monthly',
    due_day    INT DEFAULT 1,
    start_date DATE DEFAULT NULL,
    end_date   DATE DEFAULT NULL,
    notes      TEXT,
    active     BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS people_owe (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    person        VARCHAR(100) NOT NULL,
    amount        DECIMAL(15,2) NOT NULL,
    paid_amount   DECIMAL(15,2) DEFAULT 0,
    given_date    DATE,
    expected_date DATE,
    status        VARCHAR(20) DEFAULT 'Pending',
    notes         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS closed_loans (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    lender           VARCHAR(100) NOT NULL,
    purpose          VARCHAR(200),
    amount           DECIMAL(15,2) NOT NULL,
    total_paid       DECIMAL(15,2),
    recovered_amount DECIMAL(15,2) DEFAULT NULL,
    asset_type       VARCHAR(50) DEFAULT 'Loan',
    interest_paid    DECIMAL(15,2) DEFAULT NULL,
    principal_paid   DECIMAL(15,2) DEFAULT NULL,
    original_value   DECIMAL(15,2) DEFAULT NULL,
    closed_months    INT DEFAULT NULL,
    closed_date      DATE,
    notes            TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS earnings (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT NOT NULL,
    label          VARCHAR(200),
    monthly_amount DECIMAL(15,2),
    from_date      DATE,
    to_date        DATE,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monthly_paid_marks (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    item_key   VARCHAR(100) NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_item_month (user_id, item_key, month_year),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monthly_snapshots (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    month_year    VARCHAR(7) NOT NULL,
    total_outflow DECIMAL(15,2) DEFAULT 0,
    loan_emi      DECIMAL(15,2) DEFAULT 0,
    cc_emi        DECIMAL(15,2) DEFAULT 0,
    cc_spends     DECIMAL(15,2) DEFAULT 0,
    savings_emi   DECIMAL(15,2) DEFAULT 0,
    insurance_emi DECIMAL(15,2) DEFAULT 0,
    sip_emi       DECIMAL(15,2) DEFAULT 0,
    personal_emi  DECIMAL(15,2) DEFAULT 0,
    expenses      DECIMAL(15,2) DEFAULT 0,
    total_debt    DECIMAL(15,2) DEFAULT 0,
    net_worth     DECIMAL(15,2) DEFAULT 0,
    free_cash     DECIMAL(15,2) DEFAULT 0,
    items_paid    INT DEFAULT 0,
    items_total   INT DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_month (user_id, month_year),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_settings (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE,
    email_enabled   BOOLEAN DEFAULT FALSE,
    email_address   VARCHAR(200),
    days_before_due INT DEFAULT 2,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- First user becomes ADMIN (runs after first registration)
