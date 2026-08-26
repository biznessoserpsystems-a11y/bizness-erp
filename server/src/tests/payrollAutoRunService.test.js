jest.mock('../controllers/hrPayrollController', () => ({
  createPayrollRunCore: jest.fn(),
  processPayrollRunCore: jest.fn(),
  markPayrollRunPaidCore: jest.fn(),
}));
jest.mock('../services/notificationService', () => ({
  notifyUsersWithPermission: jest.fn(async () => {}),
}));

function createMockDb() {
  const state = { settings: [], runs: [] }; // runs: {id, company_id, period_month, period_year, status}

  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

  const query = jest.fn(async (sql, params = []) => {
    const s = norm(sql);

    if (s === 'SELECT id, status FROM payroll_runs WHERE company_id = $1 AND period_month = $2 AND period_year = $3') {
      const [companyId, periodMonth, periodYear] = params;
      const row = state.runs.find((r) => r.company_id === companyId && r.period_month === periodMonth && r.period_year === periodYear);
      return { rows: row ? [row] : [] };
    }

    if (s === 'SELECT * FROM payroll_auto_run_settings WHERE enabled = TRUE AND next_run_date <= CURRENT_DATE') {
      const today = new Date().toISOString().slice(0, 10);
      const rows = state.settings.filter((st) => st.enabled && st.next_run_date <= today);
      return { rows };
    }

    if (s.startsWith('UPDATE payroll_auto_run_settings')) {
      const [nextRunDateStr, lastRunPayrollRunId, companyId] = params;
      const setting = state.settings.find((st) => st.company_id === companyId);
      if (setting) {
        setting.next_run_date = nextRunDateStr;
        setting.last_run_payroll_run_id = lastRunPayrollRunId;
      }
      return { rows: [] };
    }

    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, state };
}

const mockDbInstance = createMockDb();
jest.mock('../config/db', () => mockDbInstance);

const { runAutoPayrollForCompany, runDueAutoPayroll, nextRunDate } = require('../services/payrollAutoRunService');
const hrPayrollController = require('../controllers/hrPayrollController');

function baseSetting(overrides = {}) {
  return {
    company_id: 'co-1', created_by: 'user-1', enabled: true,
    payment_method: 'bank_transfer', bank_account_id: 'acct-1',
    auto_mark_paid: false, run_day: 25,
    next_run_date: '2026-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  mockDbInstance.state.settings.length = 0;
  mockDbInstance.state.runs.length = 0;
  hrPayrollController.createPayrollRunCore.mockReset();
  hrPayrollController.processPayrollRunCore.mockReset();
  hrPayrollController.markPayrollRunPaidCore.mockReset();
});

describe('nextRunDate', () => {
  test('advances to the same day next month', () => {
    const result = nextRunDate('2026-03-10', 25);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3); // April (0-indexed)
    expect(result.getDate()).toBe(25);
  });

  test('rolls over the year when advancing from December', () => {
    const result = nextRunDate('2026-12-05', 15);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });
});

describe('runAutoPayrollForCompany', () => {
  test('creates a new run when none exists for this period, then processes it', async () => {
    const setting = baseSetting();
    hrPayrollController.createPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'processed' });

    const run = await runAutoPayrollForCompany(setting);

    expect(hrPayrollController.createPayrollRunCore).toHaveBeenCalledWith(
      mockDbInstance,
      expect.objectContaining({ companyId: 'co-1', periodMonth: expect.any(Number), periodYear: expect.any(Number) })
    );
    expect(hrPayrollController.processPayrollRunCore).toHaveBeenCalledWith('co-1', 'user-1', 'run-1');
    expect(run.status).toBe('processed');
  });

  test('does not create a duplicate run when one already exists for this period - picks it up instead', async () => {
    const now = new Date();
    mockDbInstance.state.runs.push({ id: 'existing-run', company_id: 'co-1', period_month: now.getMonth() + 1, period_year: now.getFullYear(), status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'existing-run', status: 'processed' });

    await runAutoPayrollForCompany(baseSetting());

    expect(hrPayrollController.createPayrollRunCore).not.toHaveBeenCalled();
    expect(hrPayrollController.processPayrollRunCore).toHaveBeenCalledWith('co-1', 'user-1', 'existing-run');
  });

  test('an existing run that is already processed is not re-processed', async () => {
    const now = new Date();
    mockDbInstance.state.runs.push({ id: 'existing-run', company_id: 'co-1', period_month: now.getMonth() + 1, period_year: now.getFullYear(), status: 'processed' });

    await runAutoPayrollForCompany(baseSetting({ auto_mark_paid: false }));

    expect(hrPayrollController.processPayrollRunCore).not.toHaveBeenCalled();
    expect(hrPayrollController.markPayrollRunPaidCore).not.toHaveBeenCalled();
  });

  test('marks the run paid only when the company has explicitly opted in', async () => {
    hrPayrollController.createPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'processed' });

    await runAutoPayrollForCompany(baseSetting({ auto_mark_paid: false }));
    expect(hrPayrollController.markPayrollRunPaidCore).not.toHaveBeenCalled();
  });

  test('marks the run paid when auto_mark_paid is enabled and the run reached processed status', async () => {
    hrPayrollController.createPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'processed' });
    hrPayrollController.markPayrollRunPaidCore.mockResolvedValue({ id: 'run-1', status: 'paid' });

    const run = await runAutoPayrollForCompany(baseSetting({ auto_mark_paid: true }));

    expect(hrPayrollController.markPayrollRunPaidCore).toHaveBeenCalledWith('co-1', 'user-1', 'run-1');
    expect(run.status).toBe('paid');
  });

  test('does not attempt to mark paid if the run never reached processed status', async () => {
    hrPayrollController.createPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'draft' });

    await runAutoPayrollForCompany(baseSetting({ auto_mark_paid: true }));
    expect(hrPayrollController.markPayrollRunPaidCore).not.toHaveBeenCalled();
  });

  test('advances next_run_date to next month regardless of outcome', async () => {
    hrPayrollController.createPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-1', status: 'processed' });
    const setting = baseSetting({ run_day: 20, next_run_date: '2026-01-01' });
    mockDbInstance.state.settings.push(setting);

    await runAutoPayrollForCompany(setting);

    const updated = mockDbInstance.state.settings.find((s) => s.company_id === 'co-1');
    const now = new Date();
    const expectedMonth = (now.getMonth() + 1) % 12;
    expect(new Date(updated.next_run_date).getDate()).toBe(20);
    expect(new Date(updated.next_run_date + 'T00:00:00').getMonth()).toBe(expectedMonth);
  });
});

describe('runDueAutoPayroll', () => {
  test('only processes enabled settings whose next_run_date has arrived', async () => {
    mockDbInstance.state.settings.push(
      baseSetting({ company_id: 'co-1', enabled: true, next_run_date: '2020-01-01' }),
      baseSetting({ company_id: 'co-2', enabled: true, next_run_date: '2099-01-01' }),
      baseSetting({ company_id: 'co-3', enabled: false, next_run_date: '2020-01-01' })
    );
    hrPayrollController.createPayrollRunCore.mockResolvedValue({ id: 'run-x', status: 'draft' });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-x', status: 'processed' });

    const results = await runDueAutoPayroll();
    expect(results).toHaveLength(1);
    expect(results[0].companyId).toBe('co-1');
  });

  test('one company failing does not prevent other due companies from being processed', async () => {
    mockDbInstance.state.settings.push(
      baseSetting({ company_id: 'co-1', next_run_date: '2020-01-01' }),
      baseSetting({ company_id: 'co-2', next_run_date: '2020-01-01' })
    );
    hrPayrollController.createPayrollRunCore.mockImplementation(async (client, { companyId }) => {
      if (companyId === 'co-1') throw new Error('Payroll blew up for co-1');
      return { id: 'run-co2', status: 'draft' };
    });
    hrPayrollController.processPayrollRunCore.mockResolvedValue({ id: 'run-co2', status: 'processed' });

    const results = await runDueAutoPayroll();
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.companyId === 'co-1')).toMatchObject({ ok: false, error: 'Payroll blew up for co-1' });
    expect(results.find((r) => r.companyId === 'co-2')).toMatchObject({ ok: true, payrollRunId: 'run-co2' });
  });
});
