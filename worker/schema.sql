CREATE TABLE IF NOT EXISTS trades(address TEXT PRIMARY KEY,seller TEXT NOT NULL,buyer TEXT NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS trades_seller ON trades(seller,updated_at);
CREATE INDEX IF NOT EXISTS trades_buyer ON trades(buyer,updated_at);
