-- ============================================
-- טבלת משתמשים
-- ============================================
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE app.users (
id SERIAL PRIMARY KEY,
email VARCHAR(255) UNIQUE NOT NULL,
first_name VARCHAR(100),
last_name VARCHAR(100),
password_hash VARCHAR(255) NOT NULL,
theme VARCHAR(20) DEFAULT 'light',
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ============================================
-- טבלת רשתות
-- ============================================
CREATE TABLE app.chains (
id BIGINT PRIMARY KEY,
name VARCHAR(255) NOT NULL UNIQUE,
logo_url VARCHAR(255),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ============================================
-- טבלת תת-רשתות
-- ============================================
CREATE TABLE app.sub_chains (
id INT PRIMARY KEY,
chain_id BIGINT NOT NULL REFERENCES app.chains(id) ON DELETE CASCADE,
name VARCHAR(255),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ============================================
-- טבלת סניפים
-- ============================================
CREATE TABLE app.branches (
id INT PRIMARY KEY,
chain_id BIGINT NOT NULL REFERENCES app.chains(id) ON DELETE CASCADE,
sub_chain_id INT REFERENCES app.sub_chains(id) ON DELETE SET NULL,
branch_name VARCHAR(255),
address VARCHAR(255),
city VARCHAR(100),
latitude DECIMAL(9, 6),
longitude DECIMAL(9, 6),
bikoret_no INT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ============================================
-- טבלת מוצרים
-- ============================================
CREATE TABLE app.items (
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
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(item_code, manufacturer, is_weighted)
);
-- ============================================
-- טבלת מחירים
-- ============================================
CREATE TABLE app.prices (
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
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(item_id, branch_id)
);
CREATE INDEX idx_prices_item ON app.prices(item_id);
CREATE INDEX idx_prices_branch ON app.prices(branch_id);
CREATE INDEX idx_prices_update_time ON app.prices(price_update_time);
-- ============================================
-- טבלת סלים
-- ============================================
CREATE TABLE app.baskets (
id SERIAL PRIMARY KEY,
user_id INT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
basket_name VARCHAR(100) DEFAULT 'My Basket',
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ============================================
-- טבלת פריטים בסל
-- ============================================
CREATE TABLE app.basket_items (
id SERIAL PRIMARY KEY,
basket_id INT NOT NULL REFERENCES app.baskets(id) ON DELETE CASCADE,
item_id INT NOT NULL REFERENCES app.items(id) ON DELETE CASCADE,
quantity DECIMAL(10, 2) DEFAULT 1.0,
added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(basket_id, item_id)
);
-- ============================================
-- טבלת מועדפים
-- ============================================
CREATE TABLE app.user_favorites (
id SERIAL PRIMARY KEY,
user_id INT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
item_id INT NOT NULL REFERENCES app.items(id) ON DELETE CASCADE,
added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(user_id, item_id)
);
-- ============================================
-- טבלת היסטוריית קניות
-- ============================================
CREATE TABLE app.purchase_history (
id SERIAL PRIMARY KEY,
user_id INT NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
item_id INT NOT NULL REFERENCES app.items(id) ON DELETE CASCADE,
quantity DECIMAL(10, 2) DEFAULT 1.0,
price_paid DECIMAL(10, 2),
purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);