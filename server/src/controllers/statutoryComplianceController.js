const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

async function accountBalance(companyId, mappingKey) {
  const { rows } = await db.query(
    `SELECT coa.account_name, coa.normal_balance,
            COALESCE(SUM(jel.debit), 0) AS total_debit, COALESCE(SUM(jel.credit), 0) AS total_credit
     FROM gl_account_mappings gam
     JOIN chart_of_accounts coa ON coa.id = gam.account_id
     LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
     LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed'
     WHERE gam.company_id = $1 AND gam.mapping_key = $2
     GROUP BY coa.id, coa.account_name, coa.normal_balance`,
    [companyId, mappingKey]
  );
  if (!rows.length) return null;
  const { account_name: accountName, normal_balance: normalBalance, total_debit: debit, total_credit: credit } = rows[0];
  const netDebit = Number(debit) - Number(credit);
  const balance = normalBalance === 'debit' ? netDebit : -netDebit;
  return { accountName, balance };
}

// GET /statutory-compliance-status — computed statutory balances (SSNIT,
// PAYE, VAT) plus the manually-tracked register (WHT, TCC, EPA, permits).
// All four computed figures read the real GL account balance behind each
// statutory obligation — not a period-based filing total (that's what Tax
// Reports is for) — so what's shown here is the actual outstanding amount
// right now, net of whatever's already been paid/claimed, the same way a
// bank balance reflects deposits minus withdrawals rather than a running
// sum of deposits.
//
// Not to be confused with the separate HR Compliance module
// (complianceController.js / /compliance-documents, /company-policies,
// /compliance-incidents) — that tracks internal HR policy acknowledgment
// and incidents; this tracks external statutory/regulatory obligations.
// Different domains that happen to share the word "compliance".
const getComplianceStatus = asyncHandler(async (req, res) => {
  const [ssnit, paye, vatPayable, vatInput] = await Promise.all([
    accountBalance(req.user.companyId, 'ssnit_payable'),
    accountBalance(req.user.companyId, 'paye_payable'),
    accountBalance(req.user.companyId, 'vat_payable'),
    accountBalance(req.user.companyId, 'vat_input'),
  ]);

  const { rows: manual } = await db.query(
    `SELECT ci.*, u.first_name, u.last_name
     FROM compliance_items ci
     LEFT JOIN users u ON u.id = ci.updated_by
     WHERE ci.company_id = $1
     ORDER BY ci.item_type`,
    [req.user.companyId]
  );

  res.json({
    computed: {
      ssnitPayable: ssnit ? ssnit.balance : null,
      payePayable: paye ? paye.balance : null,
      outputVatPayable: vatPayable ? vatPayable.balance : null,
      inputVatRecoverable: vatInput ? vatInput.balance : null,
      netVatPosition: (vatPayable ? vatPayable.balance : 0) - (vatInput ? vatInput.balance : 0),
    },
    manual,
  });
});

// PATCH /statutory-compliance-items/:id { status, referenceNo, expiryDate, notes }
const updateComplianceItem = asyncHandler(async (req, res) => {
  const { status, referenceNo, expiryDate, notes } = req.body;
  const validStatuses = ['unknown', 'valid', 'expiring_soon', 'expired', 'not_applicable'];
  if (status !== undefined && !validStatuses.includes(status)) {
    throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);
  }

  const { rows } = await db.query(
    `UPDATE compliance_items SET
       status = COALESCE($1, status), reference_no = COALESCE($2, reference_no),
       expiry_date = COALESCE($3, expiry_date), notes = COALESCE($4, notes),
       updated_by = $5, updated_at = NOW()
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [status, referenceNo, expiryDate, notes, req.user.id, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Compliance item not found');
  res.json(rows[0]);
});

module.exports = { getComplianceStatus, updateComplianceItem, accountBalance };
