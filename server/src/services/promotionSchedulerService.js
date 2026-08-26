// Checks daily for any academic year whose LAST term (the highest
// sequence_order for that company + academic_year, not just whichever is
// literally named "Term 3" — schools don't always name their terms the
// same way) has an end_date that has already passed, with no promotion
// batch generated for it yet. When found, generates the batch of
// candidates automatically — but never applies anything. That's the
// literal shape of "automatic... except by teacher's approval": the
// proposal is automatic, the actual class change is not.
const db = require('../config/db');
const schoolController = require('../controllers/schoolController');

async function runDuePromotionGeneration() {
  // The last term per (company, academic_year) has to be identified by
  // sequence_order alone, before any end_date filtering — not the other
  // way around. Filtering to "already-ended terms" first and then taking
  // the highest sequence_order among those would let an earlier term
  // masquerade as "the last term" whenever the real last term hasn't
  // ended yet, triggering promotion generation months early. The inner
  // query finds the genuine last term for every (company, year) that
  // doesn't have a promotion batch yet, with no date filtering at all;
  // the outer query then checks whether that specific term has actually
  // ended.
  const { rows: dueTerms } = await db.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (at.company_id, at.academic_year) at.*
       FROM academic_terms at
       WHERE NOT EXISTS (SELECT 1 FROM promotion_batches pb WHERE pb.company_id = at.company_id AND pb.academic_year = at.academic_year)
       ORDER BY at.company_id, at.academic_year, at.sequence_order DESC
     ) last_terms
     WHERE last_terms.end_date < CURRENT_DATE`
  );

  const results = [];
  for (const term of dueTerms) {
    // Only act if THIS row really is the last term for its year — the
    // DISTINCT ON above already picked the highest sequence_order per
    // (company, year), so it's guaranteed to be the actual final term,
    // not just some earlier term whose end_date happens to have passed.
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await schoolController.generatePromotionBatchCore(client, term.company_id, term.academic_year, term.id, null);
      await client.query('COMMIT');
      results.push({ companyId: term.company_id, academicYear: term.academic_year, ok: true, candidateCount: result.candidateCount });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Promotion batch generation failed for company ${term.company_id}, year ${term.academic_year}:`, err.message);
      results.push({ companyId: term.company_id, academicYear: term.academic_year, ok: false, error: err.message });
    } finally {
      client.release();
    }
  }
  return results;
}

/** Starts a recurring background check. Call once from server.js. */
function startPromotionScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  setTimeout(() => runDuePromotionGeneration().catch((err) => console.error('Promotion scheduler error:', err.message)), 20000);
  setInterval(() => runDuePromotionGeneration().catch((err) => console.error('Promotion scheduler error:', err.message)), intervalMs);
}

module.exports = { runDuePromotionGeneration, startPromotionScheduler };
