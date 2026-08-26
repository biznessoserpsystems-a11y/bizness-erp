function mockCreateDb() {
  const inserted = []; // { companyId, employeeId, stepKey, dueDate }
  const query = jest.fn(async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO onboarding_steps')) {
      const [companyId, employeeId, stepKey, dueDate] = params;
      inserted.push({ companyId, employeeId, stepKey, dueDate });
      return { rows: [] };
    }
    throw new Error(`Unmocked query in test: ${s}`);
  });
  return { query, inserted };
}

jest.mock('../config/db', () => mockCreateDb());

const { seedOnboardingSteps } = require('../services/onboardingService');
const mockDb = require('../config/db');

beforeEach(() => {
  mockDb.inserted.length = 0;
});

describe('seedOnboardingSteps', () => {
  test('seeds all 7 onboarding steps for the employee', async () => {
    await seedOnboardingSteps('co-1', 'emp-1', '2026-03-01');
    expect(mockDb.inserted).toHaveLength(7);
    const stepKeys = mockDb.inserted.map((s) => s.stepKey).sort();
    expect(stepKeys).toEqual([
      'account_creation', 'department_assignment', 'equipment_allocation',
      'orientation', 'probation_review', 'supervisor_assignment', 'training_schedule',
    ]);
  });

  test('day-zero steps (orientation, department and supervisor assignment) are due on the hire date itself', async () => {
    await seedOnboardingSteps('co-1', 'emp-1', '2026-03-01');
    const byKey = Object.fromEntries(mockDb.inserted.map((s) => [s.stepKey, s.dueDate]));
    expect(byKey.orientation).toBe('2026-03-01');
    expect(byKey.department_assignment).toBe('2026-03-01');
    expect(byKey.supervisor_assignment).toBe('2026-03-01');
  });

  test('later steps are due the correct number of days after hire date', async () => {
    await seedOnboardingSteps('co-1', 'emp-1', '2026-03-01');
    const byKey = Object.fromEntries(mockDb.inserted.map((s) => [s.stepKey, s.dueDate]));
    expect(byKey.equipment_allocation).toBe('2026-03-04'); // +3 days
    expect(byKey.account_creation).toBe('2026-03-04'); // +3 days
    expect(byKey.training_schedule).toBe('2026-03-08'); // +7 days
    expect(byKey.probation_review).toBe('2026-05-30'); // +90 days
  });

  // The real correctness property worth checking here: a hire date near
  // the end of a month must correctly roll over into the next month (and
  // year, if hired late in December) rather than landing on a
  // nonexistent date like "day 33 of January".
  test('a due date correctly rolls over the month boundary for a hire date near month-end', async () => {
    await seedOnboardingSteps('co-1', 'emp-1', '2026-01-30');
    const byKey = Object.fromEntries(mockDb.inserted.map((s) => [s.stepKey, s.dueDate]));
    expect(byKey.equipment_allocation).toBe('2026-02-02'); // Jan 30 + 3 days
    expect(byKey.training_schedule).toBe('2026-02-06'); // Jan 30 + 7 days
  });

  test('a due date correctly rolls over the year boundary for a hire date in late December', async () => {
    await seedOnboardingSteps('co-1', 'emp-1', '2026-12-29');
    const byKey = Object.fromEntries(mockDb.inserted.map((s) => [s.stepKey, s.dueDate]));
    expect(byKey.equipment_allocation).toBe('2027-01-01'); // Dec 29 + 3 days
    expect(byKey.training_schedule).toBe('2027-01-05'); // Dec 29 + 7 days
  });

  test('every insert is scoped to the right company and employee', async () => {
    await seedOnboardingSteps('co-1', 'emp-1', '2026-03-01');
    expect(mockDb.inserted.every((s) => s.companyId === 'co-1' && s.employeeId === 'emp-1')).toBe(true);
  });
});
