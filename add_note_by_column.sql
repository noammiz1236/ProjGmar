-- Migration: Add note_by column to track who wrote each comment
-- Run this with: psql -U postgres -d smartcart_db -f add_note_by_column.sql

ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS note_by INT;

-- Verify the column was added
\d app.list_items
