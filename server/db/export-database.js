import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function exportDatabase() {
  const outputFile = '../../smartcart_full_export.sql';
  let sqlOutput = '';

  console.log('🚀 Starting database export...\n');

  try {
    // Header
    sqlOutput += `-- ============================================\n`;
    sqlOutput += `-- SmartCart Complete Database Export\n`;
    sqlOutput += `-- Generated: ${new Date().toISOString()}\n`;
    sqlOutput += `-- ============================================\n`;
    sqlOutput += `-- This file contains both schema and data\n`;
    sqlOutput += `-- To restore: psql -U username -d database_name -f smartcart_full_export.sql\n`;
    sqlOutput += `-- ============================================\n\n`;

    // Drop and create schemas
    sqlOutput += `DROP SCHEMA IF EXISTS app CASCADE;\n`;
    sqlOutput += `DROP SCHEMA IF EXISTS app2 CASCADE;\n\n`;
    sqlOutput += `CREATE SCHEMA app;\n`;
    sqlOutput += `CREATE SCHEMA app2;\n\n`;

    // Get all tables in order (respecting foreign keys)
    const tables = [
      // app schema - products & prices
      { schema: 'app', table: 'chains' },
      { schema: 'app', table: 'sub_chains' },
      { schema: 'app', table: 'branches' },
      { schema: 'app', table: 'items' },
      { schema: 'app', table: 'prices' },

      // app schema - lists
      { schema: 'app', table: 'list' },
      { schema: 'app', table: 'list_members' },
      { schema: 'app', table: 'list_items' },
      { schema: 'app', table: 'list_users' },
      { schema: 'app', table: 'list_item_comments' },
      { schema: 'app', table: 'list_invites' },
      { schema: 'app', table: 'list_templates' },
      { schema: 'app', table: 'template_items' },

      // app2 schema - auth
      { schema: 'app2', table: 'users' },
      { schema: 'app2', table: 'tokens' },
      { schema: 'app2', table: 'kid_requests' },
    ];

    for (const { schema, table } of tables) {
      console.log(`📊 Exporting ${schema}.${table}...`);

      // Get table structure
      const structureQuery = `
        SELECT
          'CREATE TABLE ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname) || ' (' ||
          string_agg(
            quote_ident(a.attname) || ' ' ||
            pg_catalog.format_type(a.atttypid, a.atttypmod) ||
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN d.adsrc IS NOT NULL THEN ' DEFAULT ' || d.adsrc ELSE '' END,
            ', '
          ) || ');' as create_statement
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE c.relname = $1
          AND n.nspname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
        GROUP BY n.nspname, c.relname;
      `;

      const structureResult = await pool.query(structureQuery, [table, schema]);
      if (structureResult.rows.length > 0) {
        sqlOutput += `\n-- Table: ${schema}.${table}\n`;
        sqlOutput += structureResult.rows[0].create_statement + '\n\n';
      }

      // Get data count
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${schema}.${table}`);
      const count = parseInt(countResult.rows[0].count);

      if (count > 0) {
        console.log(`  → ${count} rows`);

        // Get all data
        const dataResult = await pool.query(`SELECT * FROM ${schema}.${table}`);

        if (dataResult.rows.length > 0) {
          // Get column names
          const columns = Object.keys(dataResult.rows[0]);

          // Create INSERT statements
          sqlOutput += `-- Data for ${schema}.${table}\n`;

          for (const row of dataResult.rows) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'number') return val;
              if (typeof val === 'boolean') return val;
              if (val instanceof Date) return `'${val.toISOString()}'`;
              // Escape single quotes in strings
              return `'${String(val).replace(/'/g, "''")}'`;
            });

            sqlOutput += `INSERT INTO ${schema}.${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }

          sqlOutput += '\n';
        }
      } else {
        console.log(`  → No data`);
      }
    }

    // Add indexes
    console.log('\n📋 Adding indexes...');
    sqlOutput += `\n-- ============================================\n`;
    sqlOutput += `-- INDEXES\n`;
    sqlOutput += `-- ============================================\n\n`;

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_prices_item ON app.prices(item_id);`,
      `CREATE INDEX IF NOT EXISTS idx_prices_branch ON app.prices(branch_id);`,
      `CREATE INDEX IF NOT EXISTS idx_prices_update_time ON app.prices(price_update_time);`,
      `CREATE INDEX IF NOT EXISTS idx_list_items_listid ON app.list_items("listid");`,
      `CREATE INDEX IF NOT EXISTS idx_list_items_product_id ON app.list_items(product_id);`,
      `CREATE INDEX IF NOT EXISTS idx_item_comments_item ON app.list_item_comments(item_id);`,
      `CREATE INDEX IF NOT EXISTS idx_invites_code ON app.list_invites(invite_code);`,
      `CREATE INDEX IF NOT EXISTS idx_templates_user ON app.list_templates(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_template_items_template ON app.template_items(template_id);`,
      `CREATE INDEX IF NOT EXISTS idx_items_barcode ON app.items(barcode);`,
      `CREATE INDEX IF NOT EXISTS idx_items_name ON app.items(name);`,
      `CREATE INDEX IF NOT EXISTS idx_users_email ON app2.users(email);`,
      `CREATE INDEX IF NOT EXISTS idx_users_username ON app2.users(username);`,
      `CREATE INDEX IF NOT EXISTS idx_users_parent ON app2.users(parent_id);`,
      `CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON app2.tokens(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_tokens_type ON app2.tokens(type);`,
      `CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON app2.tokens(expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_tokens_user_type ON app2.tokens(user_id, type);`,
      `CREATE INDEX IF NOT EXISTS idx_kid_requests_parent_pending ON app2.kid_requests(parent_id, status);`,
      `CREATE INDEX IF NOT EXISTS idx_kid_requests_child ON app2.kid_requests(child_id);`,
    ];

    indexes.forEach(idx => sqlOutput += idx + '\n');

    // Add sequences reset
    sqlOutput += `\n-- ============================================\n`;
    sqlOutput += `-- Reset sequences to current max values\n`;
    sqlOutput += `-- ============================================\n\n`;

    const sequences = [
      `SELECT setval('app.items_id_seq', (SELECT MAX(id) FROM app.items));`,
      `SELECT setval('app.prices_id_seq', (SELECT MAX(id) FROM app.prices));`,
      `SELECT setval('app.list_id_seq', (SELECT MAX(id) FROM app.list));`,
      `SELECT setval('app.list_members_id_seq', (SELECT MAX(id) FROM app.list_members));`,
      `SELECT setval('app.list_items_id_seq', (SELECT MAX(id) FROM app.list_items));`,
      `SELECT setval('app2.users_id_seq', (SELECT MAX(id) FROM app2.users));`,
      `SELECT setval('app2.tokens_id_seq', (SELECT MAX(id) FROM app2.tokens));`,
      `SELECT setval('app2.kid_requests_id_seq', (SELECT MAX(id) FROM app2.kid_requests));`,
    ];

    sequences.forEach(seq => sqlOutput += seq + '\n');

    // Write to file
    fs.writeFileSync(outputFile, sqlOutput, 'utf8');

    // Get file size
    const stats = fs.statSync(outputFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n✅ Export complete!`);
    console.log(`📁 File: ${outputFile}`);
    console.log(`📦 Size: ${fileSizeMB} MB`);
    console.log(`\n📤 Send this file to your coworker`);
    console.log(`📥 They can import it with:`);
    console.log(`   psql -U username -d database_name -f smartcart_full_export.sql`);

  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

exportDatabase().catch(console.error);
