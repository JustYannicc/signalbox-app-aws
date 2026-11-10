CREATE TABLE identity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE identity_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
