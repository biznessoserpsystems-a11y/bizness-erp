const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

// currencies is a global reference table (no company_id) — every company
// shares the same currency list, but exchange rates are per-company since
// each business tracks its own rates.

// GET /currencies
const listCurrencies = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM currencies ORDER BY code ASC');
  res.json(rows);
});

// POST /currencies  { code, name, symbol }
const createCurrency = asyncHandler(async (req, res) => {
  const { code, name, symbol } = req.body;
  if (!code || !name) throw new ApiError(400, 'code and name are required');

  const { rows } = await db.query(
    `INSERT INTO currencies (code, name, symbol, is_active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol
     RETURNING *`,
    [code.toUpperCase(), name, symbol || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /currencies/:code  { name?, symbol?, isActive? }
const updateCurrency = asyncHandler(async (req, res) => {
  const { name, symbol, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE currencies
     SET name = COALESCE($1, name), symbol = COALESCE($2, symbol), is_active = COALESCE($3, is_active)
     WHERE code = $4
     RETURNING *`,
    [name, symbol, isActive, req.params.code.toUpperCase()]
  );
  if (rows.length === 0) throw new ApiError(404, 'Currency not found');
  res.json(rows[0]);
});

// GET /exchange-rates
const listExchangeRates = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT er.*, fc.name AS from_currency_name, tc.name AS to_currency_name
     FROM exchange_rates er
     JOIN currencies fc ON fc.code = er.from_currency
     JOIN currencies tc ON tc.code = er.to_currency
     WHERE er.company_id = $1
     ORDER BY er.effective_date DESC, er.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /exchange-rates  { fromCurrency, toCurrency, rate, effectiveDate }
const createExchangeRate = asyncHandler(async (req, res) => {
  const { fromCurrency, toCurrency, rate, effectiveDate } = req.body;
  if (!fromCurrency || !toCurrency || !rate || !effectiveDate) {
    throw new ApiError(400, 'fromCurrency, toCurrency, rate, and effectiveDate are required');
  }
  if (fromCurrency === toCurrency) throw new ApiError(400, 'fromCurrency and toCurrency must differ');

  const { rows } = await db.query(
    `INSERT INTO exchange_rates (company_id, from_currency, to_currency, rate, effective_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.user.companyId, fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rate, effectiveDate]
  );
  res.status(201).json(rows[0]);
});

// DELETE /exchange-rates/:id
const deleteExchangeRate = asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM exchange_rates WHERE id = $1 AND company_id = $2',
    [req.params.id, req.user.companyId]
  );
  if (rowCount === 0) throw new ApiError(404, 'Exchange rate not found');
  res.status(204).send();
});

module.exports = {
  listCurrencies, createCurrency, updateCurrency,
  listExchangeRates, createExchangeRate, deleteExchangeRate,
};
