import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testChildrenQuery() {
  try {
    // Test with user ID 1 (rdiol12@gmail.com)
    const userId = 1;
    
    const result = await pool.query(
      `SELECT id, first_name, username, created_at
       FROM app2.users
       WHERE parent_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    
    console.log('Query result for user ID', userId);
    console.log('Children found:', result.rows.length);
    console.log('Data:', JSON.stringify(result.rows, null, 2));
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

testChildrenQuery();
