-- ============================================
-- SmartCart Production Database Schema
-- ============================================
-- This file is safe to run on an existing database
-- Uses IF NOT EXISTS to avoid destroying data
-- Run with: psql -U username -d database_name -f deploy.sql
-- ============================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS app2;

-- ============================================
-- SCHEMA: app
-- Used by: parser.js (XML data import), socket.io (shopping lists)
-- ============================================

-- Retail chains (populated by parser)
CREATE TABLE IF NOT EXISTS app.chains (
  id BIGINT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  logo_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sub-chains within retail chains
CREATE TABLE IF NOT EXISTS app.sub_chains (
  id INT PRIMARY KEY,
  chain_id BIGINT NOT NULL REFERENCES app.chains(id) ON DELETE CASCADE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Store branch locations
CREATE TABLE IF NOT EXISTS app.branches (
  id INT PRIMARY KEY,
  chain_id BIGINT NOT NULL REFERENCES app.chains(id) ON DELETE CASCADE,
  sub_chain_id INT REFERENCES app.sub_chains(id) ON DELETE SET NULL,
  branch_name VARCHAR(255),
  address VARCHAR(255),
  city VARCHAR(100),
  latitude DECIMAL(9, 6),
  longitude DECIMAL(9, 6),
  bikoret_no INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products (populated by parser from XML feeds)
CREATE TABLE IF NOT EXISTS app.items (
  id SERIAL PRIMARY KEY,
  item_code VARCHAR(50) NOT NULL,
  barcode VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  manufacturer_country VARCHAR(100),
  description VARCHAR(500),
  category VARCHAR(100),
  unit_qty VARCHAR(50),
  is_weighted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(item_code, manufacturer, is_weighted)
);

-- Item prices per branch (updated by parser)
CREATE TABLE IF NOT EXISTS app.prices (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES app.items(id) ON DELETE CASCADE,
  branch_id INT NOT NULL REFERENCES app.branches(id) ON DELETE CASCADE,
  price DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(10, 4),
  item_status INT,
  allow_discount BOOLEAN DEFAULT TRUE,
  bikoret_no INT,
  price_update_time TIMESTAMP,
  last_sale_datetime TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(item_id, branch_id)
);

-- Shopping lists
CREATE TABLE IF NOT EXISTS app.list (
  id SERIAL PRIMARY KEY,
  list_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- List members with roles (admin/member)
CREATE TABLE IF NOT EXISTS app.list_members (
  id SERIAL PRIMARY KEY,
  list_id INT NOT NULL REFERENCES app.list(id) ON DELETE CASCADE,
  user_id INT NOT NULL,
  status VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(list_id, user_id)
);

-- Items in shopping lists
CREATE TABLE IF NOT EXISTS app.list_items (
  id SERIAL PRIMARY KEY,
  listId INT NOT NULL REFERENCES app.list(id) ON DELETE CASCADE,
  itemName VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2),
  storeName VARCHAR(255),
  quantity DECIMAL(10, 2) DEFAULT 1.0,
  is_checked BOOLEAN DEFAULT FALSE,
  addby INT,
  paid_by INT,
  paid_at TIMESTAMP,
  note TEXT,
  product_id INT REFERENCES app.items(id) ON DELETE SET NULL,
  addat TIMESTAMP DEFAULT NOW(),
  updatedat TIMESTAMP DEFAULT NOW()
);

-- List users (legacy table for socket.io tracking)
CREATE TABLE IF NOT EXISTS app.list_users (
  id SERIAL PRIMARY KEY,
  list_id INT NOT NULL REFERENCES app.list(id) ON DELETE CASCADE,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(list_id, user_id)
);

-- Comments on list items
CREATE TABLE IF NOT EXISTS app.list_item_comments (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES app.list_items(id) ON DELETE CASCADE,
  user_id INT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Invite links for joining lists
CREATE TABLE IF NOT EXISTS app.list_invites (
  id SERIAL PRIMARY KEY,
  list_id INT NOT NULL REFERENCES app.list(id) ON DELETE CASCADE,
  invite_code VARCHAR(64) NOT NULL UNIQUE,
  created_by INT NOT NULL,
  expires_at TIMESTAMP,
  max_uses INT,
  use_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Saved template lists
CREATE TABLE IF NOT EXISTS app.list_templates (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  source_list_id INT REFERENCES app.list(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Items in template lists
CREATE TABLE IF NOT EXISTS app.template_items (
  id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES app.list_templates(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) DEFAULT 1.0,
  note TEXT,
  sort_order INT DEFAULT 0
);

-- ============================================
-- SCHEMA: app2
-- Used by: server.js (auth, store API, family management)
-- ============================================

-- User accounts with parent-child relationships
CREATE TABLE IF NOT EXISTS app2.users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  username VARCHAR(100) UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  parent_id INT REFERENCES app2.users(id) ON DELETE CASCADE,
  email_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Auth tokens (refresh, email_verify, reset_password)
CREATE TABLE IF NOT EXISTS app2.tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES app2.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  data TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Kid requests (children request items for parent approval)
CREATE TABLE IF NOT EXISTS app2.kid_requests (
  id SERIAL PRIMARY KEY,
  child_id INT NOT NULL REFERENCES app2.users(id) ON DELETE CASCADE,
  parent_id INT NOT NULL REFERENCES app2.users(id) ON DELETE CASCADE,
  list_id INT NOT NULL REFERENCES app.list(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2),
  store_name VARCHAR(255),
  quantity DECIMAL(10, 2) DEFAULT 1.0,
  status VARCHAR(20) DEFAULT 'pending',
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  product_id INT REFERENCES app.items(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- app schema indexes
CREATE INDEX IF NOT EXISTS idx_prices_item ON app.prices(item_id);
CREATE INDEX IF NOT EXISTS idx_prices_branch ON app.prices(branch_id);
CREATE INDEX IF NOT EXISTS idx_prices_update_time ON app.prices(price_update_time);
CREATE INDEX IF NOT EXISTS idx_list_items_listid ON app.list_items("listid");
CREATE INDEX IF NOT EXISTS idx_list_items_product_id ON app.list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_item_comments_item ON app.list_item_comments(item_id);
CREATE INDEX IF NOT EXISTS idx_invites_code ON app.list_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_templates_user ON app.list_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_template_items_template ON app.template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON app.items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_name ON app.items(name);

-- app2 schema indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON app2.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON app2.users(username);
CREATE INDEX IF NOT EXISTS idx_users_parent ON app2.users(parent_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON app2.tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON app2.tokens(type);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON app2.tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_user_type ON app2.tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_kid_requests_parent_pending ON app2.kid_requests(parent_id, status);
CREATE INDEX IF NOT EXISTS idx_kid_requests_child ON app2.kid_requests(child_id);

-- ============================================
-- TRIGGERS FOR AUTO-UPDATES
-- ============================================

-- Auto-update updated_at column on users table
CREATE OR REPLACE FUNCTION app2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON app2.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON app2.users
  FOR EACH ROW
  EXECUTE FUNCTION app2.update_updated_at_column();

-- Auto-update updated_at on list table
CREATE OR REPLACE FUNCTION app.update_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_list_updated_at ON app.list;
CREATE TRIGGER update_list_updated_at
  BEFORE UPDATE ON app.list
  FOR EACH ROW
  EXECUTE FUNCTION app.update_list_updated_at();

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✓ SmartCart database schema deployed successfully';
  RAISE NOTICE 'Schemas: app (products, lists), app2 (users, auth)';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run parser.js to populate product data';
  RAISE NOTICE '  2. Start server: cd server && npm start';
  RAISE NOTICE '  3. Start frontend: cd frontend && npm run dev';
END $$;
