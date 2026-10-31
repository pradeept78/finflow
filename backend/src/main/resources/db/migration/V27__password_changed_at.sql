-- When the password last changed (own change or an admin reset). Tokens issued before it are refused
-- (JwtAuthFilter), so changing a password signs out every other device. NULL = never changed here.
ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL;
