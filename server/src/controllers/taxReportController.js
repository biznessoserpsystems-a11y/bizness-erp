const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendExport } = require('../services/exportService');

// Ghana's VAT Act, 2025 (Act 1151), effective 1 January 2026: the standard VAT rate (15%),
// NHIL (2.5%), and GETFund Levy (2.5%) are now all calculated on the same base — a combined
// 20% — replacing the pre-2026 cascading system (NHIL+GETFund+a since-abolished 1% COVID-19
// levy applied before VAT, ~21.9% effective, with NHIL/GETFund not creditable as input tax).
// Since the three components move in lockstep at these fixed statutory rates whenever tax is
// charged at all, tax_amount on a document (which LineItemsEditor.jsx now defaults new lines
// to computing at the full 20%) can be split into its VAT/NHIL/GETFund components by their
// fixed ratio to the combined rate — exact for anything taxed at the standard 20%, and the
// only sound way to show the GRA-required breakdown without a schema change to store three
// separate tax fields per line. A zero-rated or exempt line (tax_amount = 0) splits to zero
// across all three, which is correct.
const VAT_STANDARD_RATE = 0.15;
const NHIL_RATE = 0.025;
const GETFUND_RATE = 0.025;
const COMBINED_VAT_RATE = Math.round((VAT_STANDARD_RATE + NHIL_RATE + GETFUND_RATE) * 1000) / 1000; // 0.20

function splitVatComponents(taxAmount) {
  const amount = Number(taxAmount);
  return {
    vat: (amount * VAT_STANDARD_RATE) / COMBINED_VAT_RATE,
    nhil: (amount * NHIL_RATE) / COMBINED_VAT_RATE,
    getfund: (amount * GETFUND_RATE) / COMBINED_VAT_RATE,
  };
}

/**
 * GET /tax-reports/vat-summary?from=&to=
 * Output tax (charged to customers, on sales_invoices.tax_amount) minus Input tax (paid to
 * suppliers, on purchase_invoices.tax_amount) = the net amount payable to GRA for the period,
 * broken into its VAT/NHIL/GETFund components per Act 1151. Both sides come straight from the
 * documents themselves rather than the GL, since a single invoice's tax can span multiple
 * lines with different tax_percent — the header tax_amount is already the correct total.
 * Under Act 1151, NHIL and GETFund paid on purchases are creditable input tax just like VAT
 * (previously they weren't), so the net calculation nets all three components together rather
 * than treating NHIL/GETFund as a pure cost.
 */
const vatSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const outputRows = await db.query(
    `SELECT invoice_no AS doc_no, invoice_date AS doc_date, customer_id AS party_id, c.name AS party_name,
            subtotal, tax_amount, total_amount
     FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
     WHERE si.company_id = $1 AND si.invoice_date BETWEEN $2 AND $3 AND si.status != 'void'
     ORDER BY si.invoice_date`,
    [req.user.companyId, from, to]
  );

  const inputRows = await db.query(
    `SELECT invoice_no AS doc_no, invoice_date AS doc_date, supplier_id AS party_id, s.name AS party_name,
            subtotal, tax_amount, total_amount
     FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.company_id = $1 AND pi.invoice_date BETWEEN $2 AND $3
     ORDER BY pi.invoice_date`,
    [req.user.companyId, from, to]
  );

  const output = outputRows.rows.map((r) => ({ ...r, ...splitVatComponents(r.tax_amount) }));
  const input = inputRows.rows.map((r) => ({ ...r, ...splitVatComponents(r.tax_amount) }));

  const totalOutputVat = output.reduce((s, r) => s + Number(r.tax_amount), 0);
  const totalInputVat = input.reduce((s, r) => s + Number(r.tax_amount), 0);
  const netVatPayable = totalOutputVat - totalInputVat;

  const outputComponents = {
    vat: output.reduce((s, r) => s + r.vat, 0),
    nhil: output.reduce((s, r) => s + r.nhil, 0),
    getfund: output.reduce((s, r) => s + r.getfund, 0),
  };
  const inputComponents = {
    vat: input.reduce((s, r) => s + r.vat, 0),
    nhil: input.reduce((s, r) => s + r.nhil, 0),
    getfund: input.reduce((s, r) => s + r.getfund, 0),
  };
  const netComponents = {
    vat: outputComponents.vat - inputComponents.vat,
    nhil: outputComponents.nhil - inputComponents.nhil,
    getfund: outputComponents.getfund - inputComponents.getfund,
  };

  // GRA: "Taxpayers are to file their returns and make payments by the last working day of
  // each month immediately following the month to which the returns relate." Shown as
  // guidance only — actual due dates shift for weekends/holidays and GRA occasionally grants
  // extensions (e.g. for disruption events), so this isn't a substitute for the tax calendar.
  const filingNote = 'Ghana VAT/NHIL/GETFund returns are filed monthly via the GRA Taxpayers\u2019 Portal, due by the last working day of the month following the tax period.';

  if (req.query.format) {
    return sendExport(res, req.query.format, `vat-summary-${from}-to-${to}`, {
      title: 'VAT, NHIL & GETFund Summary',
      subtitle: `For the period ${from} to ${to} — combined rate 20% (VAT 15% + NHIL 2.5% + GETFund 2.5%), per the VAT Act, 2025 (Act 1151)`,
      sections: [
        {
          title: 'Output tax (charged on sales)',
          lines: [
            ...output.map((r) => ({ label: `${r.doc_no} — ${r.party_name}`, amount: r.tax_amount })),
            { label: 'of which VAT (15%)', amount: outputComponents.vat },
            { label: 'of which NHIL (2.5%)', amount: outputComponents.nhil },
            { label: 'of which GETFund Levy (2.5%)', amount: outputComponents.getfund },
          ],
          total: { label: 'Total Output Tax', amount: totalOutputVat },
        },
        {
          title: 'Input tax (paid on purchases — creditable per Act 1151)',
          lines: [
            ...input.map((r) => ({ label: `${r.doc_no} — ${r.party_name}`, amount: r.tax_amount })),
            { label: 'of which VAT (15%)', amount: inputComponents.vat },
            { label: 'of which NHIL (2.5%)', amount: inputComponents.nhil },
            { label: 'of which GETFund Levy (2.5%)', amount: inputComponents.getfund },
          ],
          total: { label: 'Total Input Tax', amount: totalInputVat },
        },
        {
          title: 'Net position by component',
          lines: [
            { label: 'Net VAT (15%)', amount: netComponents.vat },
            { label: 'Net NHIL (2.5%)', amount: netComponents.nhil },
            { label: 'Net GETFund Levy (2.5%)', amount: netComponents.getfund },
          ],
        },
      ],
      grandTotal: { label: netVatPayable >= 0 ? 'Net Payable to GRA' : 'Net Credit (carried forward)', amount: netVatPayable },
    });
  }

  res.json({
    from, to,
    output, input,
    totals: {
      totalOutputVat, totalInputVat, netVatPayable,
      outputComponents, inputComponents, netComponents,
    },
    rates: { vat: VAT_STANDARD_RATE, nhil: NHIL_RATE, getfund: GETFUND_RATE, combined: COMBINED_VAT_RATE },
    filingNote,
  });
});

/**
 * GET /tax-reports/paye-summary?from=&to=
 * PAYE withheld from employees, by payroll run — payslips.income_tax is
 * already the computed PAYE per employee per run (see payrollService.js),
 * this just aggregates it. SSNIT employee contributions are included
 * alongside since they're filed together in practice even though SSNIT is
 * a statutory social-security contribution rather than a GRA tax.
 */
const payeSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const { rows } = await db.query(
    `SELECT pr.id AS payroll_run_id, pr.period_year, pr.period_month, pr.status,
            make_date(pr.period_year, pr.period_month, 1) AS period_date,
            COALESCE(SUM(ps.income_tax), 0) AS total_paye,
            COALESCE(SUM(ps.ssnit_employee), 0) AS total_ssnit_employee,
            COALESCE(SUM(ps.gross_pay), 0) AS total_gross
     FROM payroll_runs pr
     LEFT JOIN payslips ps ON ps.payroll_run_id = pr.id
     WHERE pr.company_id = $1 AND make_date(pr.period_year, pr.period_month, 1) BETWEEN $2 AND $3
     GROUP BY pr.id, pr.period_year, pr.period_month, pr.status
     ORDER BY pr.period_year, pr.period_month`,
    [req.user.companyId, from, to]
  );

  const totalPaye = rows.reduce((s, r) => s + Number(r.total_paye), 0);
  const totalSsnitEmployee = rows.reduce((s, r) => s + Number(r.total_ssnit_employee), 0);

  // GRA: employers must remit monthly PAYE within 15 days of month-end; SSNIT contributions
  // (employee + employer share) are due by the 14th of the following month. Both filed
  // separately — PAYE via the GRA Taxpayers' Portal, SSNIT via the SSNIT employer portal.
  const filingNote = 'PAYE is due to GRA within 15 days after month-end; SSNIT contributions (employee + employer) are due to SSNIT by the 14th of the following month — two separate filings.';

  if (req.query.format) {
    return sendExport(res, req.query.format, `paye-summary-${from}-to-${to}`, {
      title: 'PAYE & Statutory Deductions Summary',
      subtitle: `For the period ${from} to ${to}`,
      columns: [
        { key: 'period_date', label: 'Period', format: 'date' },
        { key: 'total_gross', label: 'Gross Pay', format: 'currency', align: 'right' },
        { key: 'total_paye', label: 'PAYE Withheld', format: 'currency', align: 'right' },
        { key: 'total_ssnit_employee', label: 'SSNIT (Employee)', format: 'currency', align: 'right' },
      ],
      rows,
    });
  }

  res.json({ from, to, runs: rows, totals: { totalPaye, totalSsnitEmployee }, filingNote });
});

module.exports = { vatSummary, payeSummary };
