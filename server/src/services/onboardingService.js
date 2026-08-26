const db = require('../config/db');

const STEP_OFFSETS_DAYS = {
  orientation: 0,
  department_assignment: 0,
  supervisor_assignment: 0,
  equipment_allocation: 3,
  account_creation: 3,
  training_schedule: 7,
  probation_review: 90,
};

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Seeds all 7 onboarding steps for a newly created employee, due relative
// to their hire date. Safe to call once per employee — the UNIQUE
// (employee_id, step_key) constraint plus ON CONFLICT DO NOTHING makes it
// idempotent if ever called twice for the same employee.
async function seedOnboardingSteps(companyId, employeeId, hireDate) {
  for (const [stepKey, offset] of Object.entries(STEP_OFFSETS_DAYS)) {
    await db.query(
      `INSERT INTO onboarding_steps (company_id, employee_id, step_key, due_date)
       VALUES ($1,$2,$3,$4) ON CONFLICT (employee_id, step_key) DO NOTHING`,
      [companyId, employeeId, stepKey, addDays(hireDate, offset)]
    );
  }
}

module.exports = { seedOnboardingSteps };
