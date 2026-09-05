const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },

  // Keep the number of connections low on Vercel
  max: 5,

  // Close idle connections after 10 seconds
  idleTimeoutMillis: 10000,

  // Don't wait forever for a connection
  connectionTimeoutMillis: 10000,

  // Recycle connections periodically
  maxLifetimeSeconds: 60,
});

pool.on("connect", () => {
  console.log("PostgreSQL connection established");
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

module.exports = pool;
