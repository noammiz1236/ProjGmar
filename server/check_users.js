import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkUsers() {
  try {
    const result = await pool.query(`
      SELECT id, email, username, first_name, parent_id 
      FROM app2.users 
      WHERE email = 'rdiol12@gmail.com' OR username = '0050900' OR parent_id IS NOT NULL
      ORDER BY id
    `);
    
    console.log('Users found:', JSON.stringify(result.rows, null, 2));
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

checkUsers();
