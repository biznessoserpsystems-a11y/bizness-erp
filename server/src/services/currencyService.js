const ApiError = require('../utils/ApiError');

/**
 * Finds the exchange rate from `fromCurrency` to `toCurrency` effective on or
 * before `date` (the most recent one on file). Checks the direct rate first,
 * then falls back to the inverse of the reverse-direction rate — most companies
 * will only ever enter rates in one direction (e.g. USD -> GHS), and requiring
 * both directions to be entered separately would be needless double-entry.
 * Returns 1 if the currencies are the same. Throws if no rate is on file at all.
 */
async function getRate(client, companyId, fromCurrency, toCurrency, date) {
  if (fromCurrency === toCurrency) return 1;
  const asOf = date || new Date().toISOString().slice(0, 10);

  const direct = await client.query(
    `SELECT rate FROM exchange_rates
     WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4
     ORDER BY effective_date DESC LIMIT 1`,
    [companyId, fromCurrency, toCurrency, asOf]
  );
  if (direct.rows.length) return Number(direct.rows[0].rate);

  const inverse = await client.query(
    `SELECT rate FROM exchange_rates
     WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4
     ORDER BY effective_date DESC LIMIT 1`,
    [companyId, toCurrency, fromCurrency, asOf]
  );
  if (inverse.rows.length) return 1 / Number(inverse.rows[0].rate);

  throw new ApiError(400, `No exchange rate on file for ${fromCurrency} → ${toCurrency} on or before ${asOf}. Add one under Accounting > Exchange Rates first.`);
}

/** Converts `amount` in `currency` to the company's base currency as of `date`. */
async function convertToBase(client, companyId, amount, currency, date) {
  const company = await client.query('SELECT base_currency FROM companies WHERE id = $1', [companyId]);
  const baseCurrency = company.rows[0]?.base_currency || 'GHS';
  const rate = await getRate(client, companyId, currency, baseCurrency, date);
  return { baseAmount: Math.round(Number(amount) * rate * 10000) / 10000, rate, baseCurrency };
}

module.exports = { getRate, convertToBase };
