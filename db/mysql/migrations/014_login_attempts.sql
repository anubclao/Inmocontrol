-- Migración 013: tabla login_attempts para rate limit.
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  email VARCHAR(255) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  window_start BIGINT UNSIGNED NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cleared_at DATETIME NULL,
  INDEX idx_ip_email (ip, email, attempted_at),
  INDEX idx_window (window_start),
  UNIQUE KEY uniq_window (ip, email, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;