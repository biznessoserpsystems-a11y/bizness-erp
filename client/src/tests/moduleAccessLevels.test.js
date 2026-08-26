import { describe, test, expect } from 'vitest';
import { isViewTier, groupPermissionsByModule, deriveAccessLevel, idsForLevel, applyModuleLevel } from '../moduleAccessLevels';

const PERMISSIONS = [
  { id: 1, module: 'accounting', action: 'view_ledger', code: 'accounting.view_ledger' },
  { id: 2, module: 'accounting', action: 'manage_journal', code: 'accounting.manage_journal' },
  { id: 3, module: 'accounting', action: 'manage_banking', code: 'accounting.manage_banking' },
  { id: 4, module: 'crm', action: 'manage_contacts', code: 'crm.manage_contacts' },
  { id: 5, module: 'crm', action: 'manage_leads', code: 'crm.manage_leads' },
  { id: 6, module: 'dashboard', action: 'view_executive', code: 'dashboard.view_executive' },
  { id: 7, module: 'school', action: 'view', code: 'school.view' },
  { id: 8, module: 'school', action: 'manage', code: 'school.manage' },
];

describe('isViewTier', () => {
  test('a bare "view" action is view-tier', () => {
    expect(isViewTier('view')).toBe(true);
  });
  test('a "view_*" action is view-tier', () => {
    expect(isViewTier('view_ledger')).toBe(true);
    expect(isViewTier('view_executive')).toBe(true);
  });
  test('a "manage_*" action is not view-tier', () => {
    expect(isViewTier('manage_journal')).toBe(false);
  });
  test('an action that merely contains "view" mid-word is not view-tier', () => {
    expect(isViewTier('review_all')).toBe(false);
  });
});

describe('groupPermissionsByModule', () => {
  const groups = groupPermissionsByModule(PERMISSIONS);

  test('groups by module and classifies each permission into the right tier', () => {
    const accounting = groups.find((g) => g.module === 'accounting');
    expect(accounting.viewTierIds).toEqual([1]);
    expect(accounting.editTierIds.sort()).toEqual([2, 3]);
  });

  test('a module with both tiers offers all three levels', () => {
    const school = groups.find((g) => g.module === 'school');
    expect(school.availableLevels).toEqual(['none', 'view', 'edit']);
  });

  test('a module with no view-tier permission does not offer "view" as a level', () => {
    const crm = groups.find((g) => g.module === 'crm');
    expect(crm.availableLevels).toEqual(['none', 'edit']);
  });

  test('a module with no edit-tier permission does not offer "edit" as a level', () => {
    const dashboard = groups.find((g) => g.module === 'dashboard');
    expect(dashboard.availableLevels).toEqual(['none', 'view']);
  });

  test('modules are sorted alphabetically', () => {
    expect(groups.map((g) => g.module)).toEqual(['accounting', 'crm', 'dashboard', 'school']);
  });
});

describe('deriveAccessLevel', () => {
  const groups = groupPermissionsByModule(PERMISSIONS);
  const accounting = groups.find((g) => g.module === 'accounting');
  const crm = groups.find((g) => g.module === 'crm');

  test('no selected IDs in the module is "none"', () => {
    expect(deriveAccessLevel(accounting, [])).toBe('none');
    expect(deriveAccessLevel(accounting, [4, 5])).toBe('none');
  });

  test('exactly the view-tier IDs selected is "view"', () => {
    expect(deriveAccessLevel(accounting, [1])).toBe('view');
  });

  test('every ID in the module selected is "edit"', () => {
    expect(deriveAccessLevel(accounting, [1, 2, 3])).toBe('edit');
  });

  test('a partial, mixed selection that matches none of the three cleanly is "custom"', () => {
    expect(deriveAccessLevel(accounting, [2])).toBe('custom');
    expect(deriveAccessLevel(accounting, [1, 2])).toBe('custom');
  });

  test('a module with no view-tier permission is never derived as "view", even with a partial selection', () => {
    expect(deriveAccessLevel(crm, [4])).toBe('custom');
  });

  test('unrelated selected IDs from other modules do not affect the result', () => {
    expect(deriveAccessLevel(accounting, [1, 6, 7])).toBe('view');
  });
});

describe('idsForLevel', () => {
  const groups = groupPermissionsByModule(PERMISSIONS);
  const accounting = groups.find((g) => g.module === 'accounting');

  test('"none" grants nothing', () => {
    expect(idsForLevel(accounting, 'none')).toEqual([]);
  });

  test('"view" grants only the view-tier IDs', () => {
    expect(idsForLevel(accounting, 'view')).toEqual([1]);
  });

  test('"edit" grants every ID, view-tier included', () => {
    expect(idsForLevel(accounting, 'edit').sort()).toEqual([1, 2, 3]);
  });
});

describe('applyModuleLevel', () => {
  const groups = groupPermissionsByModule(PERMISSIONS);
  const accounting = groups.find((g) => g.module === 'accounting');

  test('sets a module to edit without needing any prior selection', () => {
    const result = applyModuleLevel(accounting, [], 'edit');
    expect(result.sort()).toEqual([1, 2, 3]);
  });

  test("changing one module's level does not disturb a different module's selected permissions", () => {
    const currentIds = [4, 5, 6];
    const result = applyModuleLevel(accounting, currentIds, 'view');
    expect(result.sort()).toEqual([1, 4, 5, 6]);
  });

  test("downgrading from edit to none removes exactly that module's IDs, nothing else", () => {
    const currentIds = [1, 2, 3, 4, 5];
    const result = applyModuleLevel(accounting, currentIds, 'none');
    expect(result.sort()).toEqual([4, 5]);
  });

  test('normalizing a "custom" (partial) selection to "edit" replaces it cleanly, not additively', () => {
    const currentIds = [2];
    const result = applyModuleLevel(accounting, currentIds, 'edit');
    expect(result.sort()).toEqual([1, 2, 3]);
  });
});
