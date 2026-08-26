import { describe, test, expect } from 'vitest';
import { isModuleApplicable, SPECIALIZED_MODULES } from '../moduleApplicability';

// The full, authoritative list this mapping is built against — kept
// in sync with NATURE_OF_BUSINESS_OPTIONS in authController.js. If that
// list ever changes without this one being updated, the "every value is
// real" test below will catch the mismatch.
const REAL_NATURE_OF_BUSINESS_OPTIONS = [
  'Trading & Distribution', 'Manufacturing Industries', 'Construction & Engineering',
  'Professional Services', 'Educational Institutions', 'Healthcare', 'Hospitality',
  'Transport & Logistics', 'Agriculture', 'Mining & Natural Resources',
  'Non-Profit Organizations', 'Religious Organizations', 'Government & Public Sector',
  'Real Estate', 'Media & Entertainment', 'Telecommunications', 'Automotive',
  'Energy & Utilities', 'Security Services', 'Beauty & Lifestyle', 'Sports & Recreation',
  'Travel & Tourism', 'E-Commerce & Digital Businesses', 'Rental & Leasing',
  'Import & Export', 'Cooperatives', 'Multi-Business Groups', 'Special Industry Solutions',
];

describe('SPECIALIZED_MODULES data integrity', () => {
  test('every Nature of Business value used in the mapping is a real, current option', () => {
    for (const [section, list] of Object.entries(SPECIALIZED_MODULES)) {
      for (const nob of list) {
        expect(REAL_NATURE_OF_BUSINESS_OPTIONS, `${section} references an unknown value: "${nob}"`).toContain(nob);
      }
    }
  });

  test('no gated module lists the same Nature of Business value twice', () => {
    for (const [section, list] of Object.entries(SPECIALIZED_MODULES)) {
      const duplicates = list.filter((v, i) => list.indexOf(v) !== i);
      expect(duplicates, `${section} has duplicate entries`).toEqual([]);
    }
  });
});

describe('isModuleApplicable', () => {
  test('a section not listed in SPECIALIZED_MODULES is universal, applicable to any business type', () => {
    expect(isModuleApplicable('Accounting & Finance', 'Non-Profit Organizations')).toBe(true);
    expect(isModuleApplicable('Sales & Distribution', 'Government & Public Sector')).toBe(true);
  });

  test('a company with no Nature of Business set at all sees every module, gated or not', () => {
    expect(isModuleApplicable('School Management', '')).toBe(true);
    expect(isModuleApplicable('Manufacturing', null)).toBe(true);
    expect(isModuleApplicable('Rental Services', undefined)).toBe(true);
  });

  test('School Management is applicable only to Educational Institutions, nothing else', () => {
    expect(isModuleApplicable('School Management', 'Educational Institutions')).toBe(true);
    expect(isModuleApplicable('School Management', 'Trading & Distribution')).toBe(false);
    expect(isModuleApplicable('School Management', 'Healthcare')).toBe(false);
  });

  test('the three purely non-commercial categories get none of the gated modules', () => {
    const gatedModules = ['Manufacturing', 'School Management', 'Rental Services', 'Service Business', 'Inventory & Warehouse'];
    for (const nob of ['Non-Profit Organizations', 'Religious Organizations', 'Government & Public Sector']) {
      for (const mod of gatedModules) {
        expect(isModuleApplicable(mod, nob), `${mod} should not apply to ${nob}`).toBe(false);
      }
    }
  });

  test('Multi-Business Groups and Special Industry Solutions get every gated module, since both categories exist specifically for businesses that do not fit one mold', () => {
    const gatedModules = ['Manufacturing', 'Rental Services', 'Service Business', 'Inventory & Warehouse'];
    for (const nob of ['Multi-Business Groups', 'Special Industry Solutions']) {
      for (const mod of gatedModules) {
        expect(isModuleApplicable(mod, nob), `${mod} should apply to ${nob}`).toBe(true);
      }
    }
  });

  test('Healthcare gets Inventory & Warehouse (medical supplies) despite not being a "trading" business on its face', () => {
    expect(isModuleApplicable('Inventory & Warehouse', 'Healthcare')).toBe(true);
  });

  test('Professional Services gets Service Business but not Inventory & Warehouse', () => {
    expect(isModuleApplicable('Service Business', 'Professional Services')).toBe(true);
    expect(isModuleApplicable('Inventory & Warehouse', 'Professional Services')).toBe(false);
  });
});
