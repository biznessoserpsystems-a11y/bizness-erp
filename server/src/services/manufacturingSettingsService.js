/**
 * Returns this company's manufacturing_settings row, creating a
 * default-valued one first if it doesn't exist yet (e.g. a company created
 * before 049_manufacturing_settings.sql ran its backfill). Safe to call
 * with either the shared pool or a transaction's client.
 */
async function getSettings(client, companyId) {
  await client.query(
    `INSERT INTO manufacturing_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
    [companyId]
  );
  const { rows } = await client.query('SELECT * FROM manufacturing_settings WHERE company_id = $1', [companyId]);
  return rows[0];
}

module.exports = { getSettings };
