require("dotenv").config();
const { Client } = require("pg");

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();

    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'crm_deals'
        AND column_name LIKE 'hubspot_%'
      ORDER BY ordinal_position
    `);

    console.log("COLONNES HUBSPOT :");
    console.table(columns.rows);

    const migrations = await client.query(`
      SELECT count(*)::int AS total
      FROM drizzle.__drizzle_migrations
    `);

    console.log("MIGRATIONS ENREGISTRÉES :", migrations.rows[0].total);

  } finally {
    await client.end();
  }
})().catch(error => {
  console.error("ERREUR :", error.message);
  process.exit(1);
});
