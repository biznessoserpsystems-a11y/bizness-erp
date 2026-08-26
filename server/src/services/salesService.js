/**
 * Shared math for every sales document (quotations, orders, invoices, returns).
 * Tax is applied to the post-discount amount, which is standard VAT practice:
 *   lineSubtotal   = quantity * unitPrice
 *   discountAmount = lineSubtotal * discountPercent / 100
 *   taxableAmount  = lineSubtotal - discountAmount
 *   taxAmount      = taxableAmount * taxPercent / 100
 *   lineTotal      = taxableAmount + taxAmount
 */
function calcLine({ quantity, unitPrice, discountPercent = 0, taxPercent = 0 }) {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const discPct = Number(discountPercent) || 0;
  const taxPct = Number(taxPercent) || 0;

  const lineSubtotal = qty * price;
  const discountAmount = lineSubtotal * (discPct / 100);
  const taxableAmount = lineSubtotal - discountAmount;
  const taxAmount = taxableAmount * (taxPct / 100);
  const lineTotal = taxableAmount + taxAmount;

  return {
    lineSubtotal: round(lineSubtotal),
    discountAmount: round(discountAmount),
    taxAmount: round(taxAmount),
    lineTotal: round(lineTotal),
  };
}

/**
 * Aggregates a set of calculated lines into header-level totals.
 *
 * Each per-line figure calcLine returns is already rounded, but summing
 * several already-rounded numbers in JavaScript can still land on a
 * value like 30.999999999999996 instead of a clean 31 — ordinary binary
 * floating-point addition, not a rounding mistake in any one line. That
 * residue matters here specifically because this total is what actually
 * gets shown to a customer on an invoice and stored as the document's
 * real total, not an intermediate value some later step cleans up — so
 * the accumulated result is rounded again before it's returned, the
 * same as every individual line already is.
 */
function calcHeaderTotals(lines) {
  const totals = lines.reduce(
    (acc, l) => {
      const calc = calcLine(l);
      acc.subtotal += calc.lineSubtotal;
      acc.discountAmount += calc.discountAmount;
      acc.taxAmount += calc.taxAmount;
      acc.totalAmount += calc.lineTotal;
      return acc;
    },
    { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 }
  );
  return {
    subtotal: round(totals.subtotal),
    discountAmount: round(totals.discountAmount),
    taxAmount: round(totals.taxAmount),
    totalAmount: round(totals.totalAmount),
  };
}

function round(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

/**
 * Issues the next sequential document number for a prefix, atomically, using
 * the company's configured format (companies.doc_number_format /
 * doc_number_padding — see Settings → Document Numbering). The counter is
 * keyed by (company, prefix, calendar year) so numbering resets every
 * January regardless of whether the format includes {YEAR} — the INSERT ..
 * ON CONFLICT DO UPDATE is a single atomic statement, so two requests
 * racing for the same prefix in the same transaction-per-request model
 * can never be issued the same number.
 *
 * Must be called with the same `client` the caller's transaction is using,
 * and awaited — this does a real query, unlike the old synchronous version.
 */
async function generateDocNo(client, companyId, prefix) {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `INSERT INTO document_number_sequences (company_id, prefix, year, next_number)
     VALUES ($1, $2, $3, 2)
     ON CONFLICT (company_id, prefix, year)
     DO UPDATE SET next_number = document_number_sequences.next_number + 1, updated_at = NOW()
     RETURNING next_number - 1 AS issued_number`,
    [companyId, prefix, year]
  );
  const issuedNumber = rows[0].issued_number;

  const companyResult = await client.query('SELECT doc_number_format, doc_number_padding FROM companies WHERE id = $1', [companyId]);
  const format = companyResult.rows[0]?.doc_number_format || '{PREFIX}-{YEAR}-{SEQ}';
  const padding = companyResult.rows[0]?.doc_number_padding ?? 5;

  return format
    .replace('{PREFIX}', prefix)
    .replace('{YEAR}', String(year))
    .replace('{SEQ}', String(issuedNumber).padStart(padding, '0'));
}

module.exports = { calcLine, calcHeaderTotals, generateDocNo, round };
