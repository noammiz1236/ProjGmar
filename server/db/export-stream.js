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

  console.log('🚀 Starting database export...\n');

  const writeStream = fs.createWriteStream(outputFile, { flags: 'w' });
  const write = (str) => writeStream.write(str);

  try {
    // Read schema
    const deploySchema = fs.readFileSync('../../deploy.sql', 'utf8');

    write(`-- ============================================\n`);
    write(`-- SmartCart Complete Database Export\n`);
    write(`-- Generated: ${new Date().toISOString()}\n`);
    write(`-- Contains: Schema + All Data (4M+ prices)\n`);
    write(`-- ============================================\n\n`);

    write(`DROP SCHEMA IF EXISTS app CASCADE;\n`);
    write(`DROP SCHEMA IF EXISTS app2 CASCADE;\n\n`);
    write(deploySchema + '\n\n');

    write(`-- ============================================\n`);
    write(`-- DATA EXPORT\n`);
    write(`-- ============================================\n\n`);

    const tables = [
      { schema: 'app', table: 'chains' },
      { schema: 'app', table: 'sub_chains' },
      { schema: 'app', table: 'branches' },
      { schema: 'app', table: 'items' },
      { schema: 'app', table: 'prices' },
      { schema: 'app', table: 'list' },
      { schema: 'app', table: 'list_members' },
      { schema: 'app', table: 'list_items' },
      { schema: 'app', table: 'list_users' },
      { schema: 'app', table: 'list_item_comments' },
      { schema: 'app', table: 'list_invites' },
      { schema: 'app', table: 'list_templates' },
      { schema: 'app', table: 'template_items' },
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

      write(`\n-- Data for ${schema}.${table} (${count} rows)\n`);

      // Use cursor for large tables
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DECLARE ${table}_cursor CURSOR FOR SELECT * FROM ${schema}.${table}`);

        let columns = null;
        let fetched = 0;
        const batchSize = 1000;

        while (true) {
          const result = await client.query(`FETCH ${batchSize} FROM ${table}_cursor`);
          if (result.rows.length === 0) break;

          if (!columns) {
            columns = Object.keys(result.rows[0]);
          }

          // Write inserts in smaller chunks
          const insertSize = 100;
          for (let i = 0; i < result.rows.length; i += insertSize) {
            const chunk = result.rows.slice(i, i + insertSize);

            const valuesSets = chunk.map(row => {
              const values = columns.map(col => {
                const val = row[col];
                if (val === null) return 'NULL';
                if (typeof val === 'number') return val;
                if (typeof val === 'boolean') return val;
                if (val instanceof Date) return `'${val.toISOString()}'`;
                const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "''");
                return `'${escaped}'`;
              });
              return `(${values.join(', ')})`;
            });

            write(`INSERT INTO ${schema}.${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES\n`);
            write(valuesSets.join(',\n'));
            write(';\n');
          }

          fetched += result.rows.length;
          if (count > 1000) {
            process.stdout.write(`\r  → ${fetched.toLocaleString()} / ${count.toLocaleString()}`);
          }
        }

        await client.query(`CLOSE ${table}_cursor`);
        await client.query('COMMIT');

        if (count > 1000) console.log('');  // newline
        console.log(`  ✓ Exported\n`);

      } finally {
        client.release();
      }
    }

    write(`\n-- ============================================\n`);
    write(`-- Update Sequences\n`);
    write(`-- ============================================\n\n`);

    const sequences = [
      'app.items_id_seq',
      'app.prices_id_seq',
      'app.list_id_seq',
      'app.list_members_id_seq',
      'app.list_items_id_seq',
      'app2.users_id_seq',
      'app2.tokens_id_seq',
      'app2.kid_requests_id_seq',
    ];

    for (const seq of sequences) {
      const [schema, tableName] = seq.split('.');
      const table = tableName.replace('_id_seq', '');
      write(`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${schema}.${table}), 1), true);\n`);
    }

    await new Promise((resolve, reject) => {
      writeStream.end(resolve);
      writeStream.on('error', reject);
    });

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
    console.log(`📥 Import with:`);
    console.log(`   psql -U postgres -d smartcart_db < smartcart_full_export.sql\n`);

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

exportDatabase().catch(console.error);
