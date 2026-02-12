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
    // Read the deploy.sql schema file
    const deploySchema = fs.readFileSync('../../deploy.sql', 'utf8');

    sqlOutput += `-- ============================================\n`;
    sqlOutput += `-- SmartCart Complete Database Export\n`;
    sqlOutput += `-- Generated: ${new Date().toISOString()}\n`;
    sqlOutput += `-- Contains: Schema + All Data\n`;
    sqlOutput += `-- ============================================\n\n`;

    // Add schema (from deploy.sql, but with DROP commands)
    sqlOutput += `-- Drop existing schemas\n`;
    sqlOutput += `DROP SCHEMA IF EXISTS app CASCADE;\n`;
    sqlOutput += `DROP SCHEMA IF EXISTS app2 CASCADE;\n\n`;

    // Add the schema creation
    sqlOutput += deploySchema + '\n\n';

    sqlOutput += `-- ============================================\n`;
    sqlOutput += `-- DATA EXPORT\n`;
    sqlOutput += `-- ============================================\n\n`;

    // Tables in dependency order
    const tables = [
      // app schema - products
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

      // app2 schema
      { schema: 'app2', table: 'users' },
      { schema: 'app2', table: 'tokens' },
      { schema: 'app2', table: 'kid_requests' },
    ];

    for (const { schema, table } of tables) {
      console.log(`📊 Exporting ${schema}.${table}...`);

      const countResult = await pool.query(`SELECT COUNT(*) FROM ${schema}.${table}`);
      const count = parseInt(countResult.rows[0].count);

      if (count === 0) {
        console.log(`  → No data\n`);
        continue;
      }

      console.log(`  → ${count} rows`);

      // Get all data
      const dataResult = await pool.query(`SELECT * FROM ${schema}.${table}`);

      if (dataResult.rows.length > 0) {
        sqlOutput += `\n-- Data for ${schema}.${table} (${count} rows)\n`;

        // Get column names from first row
        const columns = Object.keys(dataResult.rows[0]);

        // Batch inserts for better performance (100 rows per INSERT)
        const batchSize = 100;
        for (let i = 0; i < dataResult.rows.length; i += batchSize) {
          const batch = dataResult.rows.slice(i, i + batchSize);

          const valuesSets = batch.map(row => {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'number') return val;
              if (typeof val === 'boolean') return val;
              if (val instanceof Date) return `'${val.toISOString()}'`;
              // Escape single quotes and backslashes
              const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "''");
              return `'${escaped}'`;
            });
            return `(${values.join(', ')})`;
          });

          sqlOutput += `INSERT INTO ${schema}.${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES\n`;
          sqlOutput += valuesSets.join(',\n');
          sqlOutput += ';\n';
        }
      }

      console.log(`  ✓ Exported\n`);
    }

    // Update sequences
    sqlOutput += `\n-- ============================================\n`;
    sqlOutput += `-- Update Sequences\n`;
    sqlOutput += `-- ============================================\n\n`;

    const sequences = [
      { schema: 'app', table: 'items', sequence: 'items_id_seq' },
      { schema: 'app', table: 'prices', sequence: 'prices_id_seq' },
      { schema: 'app', table: 'list', sequence: 'list_id_seq' },
      { schema: 'app', table: 'list_members', sequence: 'list_members_id_seq' },
      { schema: 'app', table: 'list_items', sequence: 'list_items_id_seq' },
      { schema: 'app', table: 'list_users', sequence: 'list_users_id_seq' },
      { schema: 'app', table: 'list_item_comments', sequence: 'list_item_comments_id_seq' },
      { schema: 'app', table: 'list_invites', sequence: 'list_invites_id_seq' },
      { schema: 'app', table: 'list_templates', sequence: 'list_templates_id_seq' },
      { schema: 'app', table: 'template_items', sequence: 'template_items_id_seq' },
      { schema: 'app2', table: 'users', sequence: 'users_id_seq' },
      { schema: 'app2', table: 'tokens', sequence: 'tokens_id_seq' },
      { schema: 'app2', table: 'kid_requests', sequence: 'kid_requests_id_seq' },
    ];

    for (const { schema, table, sequence } of sequences) {
      sqlOutput += `SELECT setval('${schema}.${sequence}', COALESCE((SELECT MAX(id) FROM ${schema}.${table}), 1), true);\n`;
    }

    // Write to file
    console.log('\n📝 Writing to file...');
    fs.writeFileSync(outputFile, sqlOutput, 'utf8');

    // Get file stats
    const stats = fs.statSync(outputFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n✅ Export complete!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📁 File: smartcart_full_export.sql`);
    console.log(`📦 Size: ${fileSizeMB} MB`);
    console.log(`📍 Location: ProjGmar/smartcart_full_export.sql`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`📤 Send to your coworker:`);
    console.log(`   1. smartcart_full_export.sql`);
    console.log(`   2. QUICKSTART_FOR_COWORKER.md`);
    console.log(`   3. .env.example\n`);
    console.log(`📥 They import with:`);
    console.log(`   psql -U postgres -d their_database < smartcart_full_export.sql\n`);

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

exportDatabase().catch(console.error);
