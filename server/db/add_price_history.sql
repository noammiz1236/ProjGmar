-- Price history tracking table
CREATE TABLE IF NOT EXISTS app.price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  chain_id INTEGER,
  price DECIMAL(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON app.price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON app.price_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_price_history_chain ON app.price_history(chain_id);

-- Optional: track search popularity
ALTER TABLE app.items ADD COLUMN IF NOT EXISTS search_count INTEGER DEFAULT 0;
