// backend/test.js
require('dotenv').config();

const pool = require('./pg-connection');
const { createClient } = require('@supabase/supabase-js');

function assertEnv(keys, label) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`[${label}] Missing env var(s): ${missing.join(', ')}`);
  }
}

async function testPg() {
  console.log('--- Testing Postgres (pg Pool) ---');

  try {
    // Basic connectivity
    const { rows: nowRows } = await pool.query('SELECT NOW() as server_time');
    console.log('PG connected. server_time =', nowRows[0].server_time);

    // List all tables to verify schema
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`Available tables: ${tables.map(t => t.table_name).join(', ')}\n`);

    // Sample query - adjust table name based on your actual schema
    // Try lowercase 'schools' first, then uppercase 'Schools'
    let query = 'SELECT * FROM schools LIMIT 5';
    let { rows } = await pool.query(query).catch(async (err) => {
      if (err.message.includes('does not exist')) {
        console.log('Table "schools" not found, trying "Schools"...');
        query = 'SELECT * FROM "Schools" LIMIT 5';
        return await pool.query(query);
      }
      throw err;
    });

    console.log(`PG sample rows (${rows.length} found):`);
    if (rows.length > 0) {
      console.table(rows);
    } else {
      console.log('(Table is empty)');
    }

    console.log('PG test completed.\n');
  } catch (err) {
    console.error('PG Error:', err.message);
    throw err;
  }
}

async function testSupabasePublic() {
  console.log('--- Testing Supabase Public REST (supabase-js) ---');
  assertEnv(
    ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    'Supabase Public'
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  try {
    // List all tables
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    // Try querying schools table
    let { data, error } = await supabase
      .from('schools')
      .select('*')
      .limit(5);

    // If lowercase fails, try uppercase
    if (error && error.message.includes('does not exist')) {
      console.log('Table "schools" not found, trying "Schools"...');
      ({ data, error } = await supabase
        .from('Schools')
        .select('*')
        .limit(5));
    }

    if (error) throw error;

    console.log(`Supabase public sample rows (${data.length} found):`);
    if (data.length > 0) {
      console.table(data);
    } else {
      console.log('(Table is empty)');
    }
    console.log();
  } catch (err) {
    console.error('Supabase Error:', err.message);
    throw err;
  }
}

async function testMongo() {
  console.log('--- Testing MongoDB ---');
  
  try {
    const connectMongo = require('./mongo-connection');
    const db = await connectMongo();
    
    const collections = await db.listCollections().toArray();
    console.log('MongoDB connected.');
    console.log(`Available collections: ${collections.map(c => c.name).join(', ')}\n`);
  } catch (err) {
    console.error('MongoDB Error:', err.message);
    // Don't throw - MongoDB might be optional
    console.log('(Continuing without MongoDB...)\n');
  }
}

async function main() {
  try {
    console.log('=== Starting Database Connection Tests ===\n');

    // Check required envs
    assertEnv(['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DATABASE'], 'Postgres');

    await testPg();
    await testSupabasePublic();
    await testMongo();

    console.log('All tests passed.');
    process.exit(0);
  } catch (err) {
    console.error('\nTest failed:', err.message);
    console.error('\nStack trace:', err.stack);
    process.exit(1);
  } finally {
    // Always close the pool
    try {
      await pool.end();
      console.log('Database connections closed.');
    } catch (err) {
      // Ignore close errors
    }
  }
}

main();