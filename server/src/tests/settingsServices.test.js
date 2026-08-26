const inventorySettingsService = require('../services/inventorySettingsService');
const manufacturingSettingsService = require('../services/manufacturingSettingsService');
const procurementSettingsService = require('../services/procurementSettingsService');

/**
 * All three settings services share the exact same get-or-create shape:
 * INSERT ... ON CONFLICT (company_id) DO NOTHING, then SELECT the row.
 * Tested together against one small parameterized mock rather than three
 * separate, nearly-identical test files — the logic genuinely is the
 * same logic, three times, against three different tables.
 */
const SERVICES = [
  { name: 'inventorySettingsService', service: inventorySettingsService, table: 'inventory_settings' },
  { name: 'manufacturingSettingsService', service: manufacturingSettingsService, table: 'manufacturing_settings' },
  { name: 'procurementSettingsService', service: procurementSettingsService, table: 'procurement_settings' },
];

function createMockDb(table, existingRow) {
  const state = { rows: existingRow ? [existingRow] : [] };
  const query = jest.fn(async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s === `INSERT INTO ${table} (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`) {
      const [companyId] = params;
      if (!state.rows.some((r) => r.company_id === companyId)) {
        state.rows.push({ company_id: companyId }); // a bare default row, matching what the real table's own column defaults would produce
      }
      return { rows: [] };
    }
    if (s === `SELECT * FROM ${table} WHERE company_id = $1`) {
      const [companyId] = params;
      return { rows: state.rows.filter((r) => r.company_id === companyId) };
    }
    throw new Error(`Unmocked query in test: ${s}`);
  });
  return { query, state };
}

describe.each(SERVICES)('$name.getSettings', ({ service, table }) => {
  test('creates a default-valued row and returns it when none exists yet', async () => {
    const db = createMockDb(table, null);
    const result = await service.getSettings(db, 'co-1');
    expect(result).toEqual({ company_id: 'co-1' });
    expect(db.state.rows).toHaveLength(1);
  });

  test('returns the existing row unchanged rather than overwriting a company\'s real settings', async () => {
    const existing = { company_id: 'co-1', some_setting: 'a real, previously-configured value' };
    const db = createMockDb(table, existing);
    const result = await service.getSettings(db, 'co-1');
    expect(result).toEqual(existing);
    expect(db.state.rows).toHaveLength(1); // no duplicate inserted
  });

  test('is correctly scoped to the requested company, not just the first row in the table', async () => {
    const db = createMockDb(table, { company_id: 'co-other', flag: true });
    const result = await service.getSettings(db, 'co-1');
    expect(result.company_id).toBe('co-1');
    expect(db.state.rows).toHaveLength(2); // the other company's row untouched, this company's newly created
  });
});
