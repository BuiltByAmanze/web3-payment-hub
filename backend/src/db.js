const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Database features are disabled.");
}

const pool = connectionString ? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
}) : null;

if (pool) {
  pool.on("error", (err) => {
    console.error("Unexpected error on idle database client:", err.message);
  });
}

async function query(text, params) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pool.query(text, params);
}

module.exports = { pool, query };
