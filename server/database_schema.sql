-- SmartCart Database Schema
-- PostgreSQL Database Schema
-- Created: 2026-02-07

-- Drop existing schema if needed (uncomment to reset database)
-- DROP SCHEMA IF EXISTS app2 CASCADE;

-- Create schema
CREATE SCHEMA IF NOT EXISTS app2;

-- Set search path
SET search_path TO app2;

-- =====================================================
-- USERS TABLE
-- Stores user account information
-- =====================================================
CREATE TABLE IF NOT EXISTS app2.users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email_verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON app2.users(email);

-- =====================================================
-- TOKENS TABLE
-- Stores authentication and verification tokens
-- =====================================================
CREATE TABLE IF NOT EXISTS app2.tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES app2.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'refresh', 'email_verify', 'access'
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    data TEXT, -- JSON data for storing sensitive information (e.g., registration data)
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for token queries
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON app2.tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON app2.tokens(type);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON app2.tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_user_type ON app2.tokens(user_id, type);

-- Add comment to document the data column
COMMENT ON COLUMN app2.tokens.data IS 'Stores JSON data for tokens that need to carry additional information securely (e.g., user registration data during email verification)';

-- =====================================================
-- CHAINS TABLE
-- Stores retail chain information
-- =====================================================
CREATE TABLE IF NOT EXISTS app2.chains (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for chain name searches
CREATE INDEX IF NOT EXISTS idx_chains_name ON app2.chains(name);

-- =====================================================
-- BRANCHES TABLE
-- Stores individual branch/store locations
-- =====================================================
CREATE TABLE IF NOT EXISTS app2.branches (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL REFERENCES app2.chains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for branch queries
CREATE INDEX IF NOT EXISTS idx_branches_chain_id ON app2.branches(chain_id);

-- =====================================================
-- ITEMS TABLE
-- Stores product/item information
-- =====================================================
CREATE TABLE IF NOT EXISTS app2.items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for item name searches
CREATE INDEX IF NOT EXISTS idx_items_name ON app2.items(name);
CREATE INDEX IF NOT EXISTS idx_items_category ON app2.items(category);

-- =====================================================
-- PRICES TABLE
-- Stores pricing information for items at different branches
-- =====================================================
CREATE TABLE IF NOT EXISTS app2.prices (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES app2.items(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES app2.branches(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    -- Ensure one price per item per branch
    UNIQUE(item_id, branch_id)
);

-- Indexes for price queries
CREATE INDEX IF NOT EXISTS idx_prices_item_id ON app2.prices(item_id);
CREATE INDEX IF NOT EXISTS idx_prices_branch_id ON app2.prices(branch_id);
CREATE INDEX IF NOT EXISTS idx_prices_price ON app2.prices(price);

-- =====================================================
-- TRIGGER: Update timestamp on users table
-- =====================================================
CREATE OR REPLACE FUNCTION app2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON app2.users
    FOR EACH ROW
    EXECUTE FUNCTION app2.update_updated_at_column();

-- =====================================================
-- SAMPLE DATA (Optional - uncomment if needed)
-- =====================================================

-- Insert sample chains
-- INSERT INTO app2.chains (name) VALUES 
--     ('Shufersal'),
--     ('Rami Levy'),
--     ('Mega'),
--     ('Yeinot Bitan');

-- Insert sample branches
-- INSERT INTO app2.branches (chain_id, name, city) VALUES 
--     (1, 'Shufersal Tel Aviv Center', 'Tel Aviv'),
--     (1, 'Shufersal Haifa', 'Haifa'),
--     (2, 'Rami Levy Jerusalem', 'Jerusalem'),
--     (2, 'Rami Levy Beer Sheva', 'Beer Sheva');

-- Insert sample items
-- INSERT INTO app2.items (name, category) VALUES 
--     ('Milk 1L', 'Dairy'),
--     ('Bread', 'Bakery'),
--     ('Eggs 12 pack', 'Dairy'),
--     ('Olive Oil 1L', 'Pantry');

-- Insert sample prices
-- INSERT INTO app2.prices (item_id, branch_id, price) VALUES 
--     (1, 1, 5.90),
--     (1, 2, 5.80),
--     (1, 3, 6.20),
--     (2, 1, 4.50),
--     (2, 3, 4.20);

-- =====================================================
-- PERMISSIONS (Optional - adjust as needed)
-- =====================================================

-- Grant permissions to app2 user if needed
-- GRANT ALL PRIVILEGES ON SCHEMA app2 TO admin;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app2 TO admin;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app2 TO admin;

-- =====================================================
-- VIEWS (Optional helper views)
-- =====================================================

-- View to get lowest prices for each item
CREATE OR REPLACE VIEW app2.lowest_prices AS
SELECT DISTINCT ON (i.id)
    i.id AS item_id,
    i.name AS item_name,
    i.category,
    p.price AS lowest_price,
    c.name AS chain_name,
    b.name AS branch_name
FROM app2.items i
JOIN app2.prices p ON i.id = p.item_id
JOIN app2.branches b ON p.branch_id = b.id
JOIN app2.chains c ON b.chain_id = c.id
ORDER BY i.id, p.price ASC;

-- View to get active (non-expired) tokens
CREATE OR REPLACE VIEW app2.active_tokens AS
SELECT *
FROM app2.tokens
WHERE expires_at > NOW()
  AND used = FALSE;

COMMENT ON VIEW app2.lowest_prices IS 'Shows the lowest price for each item across all branches';
COMMENT ON VIEW app2.active_tokens IS 'Shows all active (non-expired and unused) tokens';
