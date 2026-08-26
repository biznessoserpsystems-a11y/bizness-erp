const db = require('../config/db');
const { generateInvoice } = require('../controllers/invoiceController');
const { notifyUsersWithPermission } = require('./notificationService');
const ApiError = require('../utils/ApiError');

/**
 * Advances a date by one cycle of the given frequency. Returns a new Date.
 *
 * Months and years get real calendar-aware handling, not a naive
 * setMonth()/setFullYear() call — JavaScript's Date silently overflows
 * into the following month when the target month is shorter than the
 * source day-of-month (there's no "February 31", so it becomes roughly
 * "March 3"). For a recurring invoice template that isn't a cosmetic
 * quirk: it permanently shifts a company's billing day. A template
 * billing on the 31st would drift to the 3rd the first time it crossed
 * February, and stay there forever afterward, since every later month
 * does have a 3rd. Clamping to the real last day of the target month
 * instead (the same convention real billing systems like Stripe use)
 * keeps every cycle anchored near month-end rather than silently
 * wandering off to an arbitrary early-month day.
 */
function advance(date, frequency) {
  const d = new Date(date);
  const originalDay = d.getDate();

  function addMonths(months) {
    const targetIndex = d.getMonth() + months;
    const targetYear = d.getFullYear() + Math.floor(targetIndex / 12);
    const targetMonth = ((targetIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    return new Date(targetYear, targetMonth, Math.min(originalDay, lastDayOfTargetMonth));
  }

  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return d;
    case 'quarterly':
      return addMonths(3);
    case 'annually': {
      const targetYear = d.getFullYear() + 1;
      const lastDayOfTargetMonth = new Date(targetYear, d.getMonth() + 1, 0).getDate();
      return new Date(targetYear, d.getMonth(), Math.min(originalDay, lastDayOfTargetMonth));
    }
    case 'monthly':
    default:
      return addMonths(1);
  }
}

/**
 * Generates one invoice from a template and advances its schedule. Runs
 * entirely inside its own transaction so a failure on one template can't
 * corrupt another's state. Shares the exact invoice-creation code path
 * (GL posting, currency resolution, credit-limit check) used by the manual
 * "create invoice" endpoint via generateInvoice().
 */
async function runTemplate(template) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const linesResult = await client.query(
      'SELECT product_id, description, quantity, unit_price, discount_percent, tax_percent FROM recurring_invoice_lines WHERE template_id = $1',
      [template.id]
    );
    if (!linesResult.rows.length) throw new ApiError(400, `Template ${template.template_name} has no line items`);
    const lines = linesResult.rows.map((l) => ({
      productId: l.product_id, description: l.description, quantity: l.quantity,
      unitPrice: l.unit_price, discountPercent: l.discount_percent, taxPercent: l.tax_percent,
    }));

    const result = await generateInvoice(client, {
      companyId: template.company_id, userId: template.created_by,
      customerId: template.customer_id, notes: template.notes, lines,
      currency: template.currency,
    });

    await client.query('UPDATE sales_invoices SET recurring_template_id = $1 WHERE id = $2', [template.id, result.invoice.id]);

    const nextRun = advance(template.next_run_date, template.frequency);
    const ended = template.end_date && nextRun > new Date(template.end_date);
    await client.query(
      `UPDATE recurring_invoice_templates SET next_run_date = $1, status = $2, updated_at = NOW() WHERE id = $3`,
      [nextRun.toISOString().slice(0, 10), ended ? 'ended' : 'active', template.id]
    );

    await notifyUsersWithPermission(client, {
      companyId: template.company_id, permissionCode: 'sales.recurring_invoices.manage',
      type: 'info', title: 'Recurring invoice generated',
      body: `${result.invoice.invoice_no} was generated from "${template.template_name}"`,
      link: '/sales/invoices', referenceType: 'sales_invoice', referenceId: result.invoice.id,
    });

    await client.query('COMMIT');
    return result.invoice;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Finds every active, due template across every company and generates its invoice. */
async function runDueTemplates() {
  const { rows } = await db.query(
    `SELECT * FROM recurring_invoice_templates WHERE status = 'active' AND next_run_date <= CURRENT_DATE`
  );
  const results = [];
  for (const template of rows) {
    try {
      const invoice = await runTemplate(template);
      results.push({ templateId: template.id, invoiceId: invoice.id, ok: true });
    } catch (err) {
      console.error(`Recurring invoice generation failed for template ${template.id} (${template.template_name}):`, err.message);
      results.push({ templateId: template.id, ok: false, error: err.message });
    }
  }
  return results;
}

/** Starts a recurring background check. Call once from server.js. */
function startRecurringInvoiceScheduler(intervalMs = 60 * 60 * 1000) {
  setTimeout(() => runDueTemplates().catch((err) => console.error('Recurring invoice scheduler error:', err.message)), 10000);
  setInterval(() => runDueTemplates().catch((err) => console.error('Recurring invoice scheduler error:', err.message)), intervalMs);
}

module.exports = { runTemplate, runDueTemplates, startRecurringInvoiceScheduler, advance };
