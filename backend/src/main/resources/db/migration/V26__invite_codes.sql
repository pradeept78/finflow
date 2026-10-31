-- Invite-only sign-up (app.signup.mode=invite): an admin creates single-use codes on /admin and hands
-- them out; /auth/register needs an unused one. used_at marks it spent (claimed atomically in
-- InviteCodeRepository.claim). Who created or used a code is kept as plain values, not foreign keys,
-- so deleting either account leaves the record readable.
CREATE TABLE invite_codes (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    code          VARCHAR(16)  NOT NULL,
    note          VARCHAR(120) NULL,
    created_by    VARCHAR(255) NULL,
    created_at    DATETIME     NOT NULL,
    used_at       DATETIME     NULL,
    used_by_email VARCHAR(255) NULL,
    CONSTRAINT uk_invite_codes_code UNIQUE (code)
);
