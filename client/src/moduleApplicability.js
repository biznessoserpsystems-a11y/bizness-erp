// Which sidebar modules are specific enough to a business type that
// showing them to everyone would just be clutter — and which Nature of
// Business categories (see NATURE_OF_BUSINESS_OPTIONS in
// authController.js — the source of truth this list must stay in sync
// with) actually need each one.
//
// Five modules are gated here — expanded from the original four
// (Manufacturing, School Management, Rental Services, Service Business)
// to also include Inventory & Warehouse, since "does this business
// physically hold and move stock" is a genuinely clean dividing line
// that the other candidates for gating don't have. Sales & Distribution,
// Procurement & Purchasing, and CRM were deliberately left universal
// even in this more thorough pass: a non-profit still invoices grantors,
// a government agency still procures from suppliers, a religious
// organization still tracks donor relationships — these are abstract
// business functions nearly every organization needs in some form,
// unlike inventory tracking, which a pure consultancy or a government
// office genuinely has no use for at all.
//
// Every judgment call below leans toward including a business type
// rather than excluding it wherever the answer was genuinely ambiguous
// (Healthcare and Transport & Logistics both got Inventory & Warehouse,
// for medical supplies and fleet parts respectively, even though
// neither is a "trading" business in the obvious sense) — hiding a
// module a real business depends on is a worse failure than showing one
// extra menu item to a business that doesn't strictly need it.
//
// "Multi-Business Groups" and "Special Industry Solutions" are
// deliberately included in every gated module's list — both categories
// exist specifically to describe businesses that don't fit a single
// mold, so the safe default for either is to show the full specialized
// set rather than guess which subset applies.
export const SPECIALIZED_MODULES = {
  Manufacturing: [
    'Manufacturing Industries', 'Construction & Engineering', 'Agriculture',
    'Mining & Natural Resources', 'Energy & Utilities', 'Automotive',
    'Multi-Business Groups', 'Special Industry Solutions',
  ],
  'School Management': ['Educational Institutions'],
  'Rental Services': [
    'Rental & Leasing', 'Real Estate', 'Automotive', 'Sports & Recreation', 'Travel & Tourism',
    'Multi-Business Groups', 'Special Industry Solutions',
  ],
  'Service Business': [
    'Professional Services', 'Healthcare', 'Construction & Engineering', 'Security Services',
    'Beauty & Lifestyle', 'Automotive', 'Transport & Logistics', 'Media & Entertainment',
    'Telecommunications', 'Hospitality', 'Travel & Tourism', 'Sports & Recreation',
    'Multi-Business Groups', 'Special Industry Solutions',
  ],
  // Businesses that physically hold and move stock — raw materials,
  // finished goods, parts, supplies, or retail product. Deliberately
  // excludes Professional Services, Educational Institutions (School
  // Management covers its own supply needs separately), Non-Profit,
  // Religious, and Government organizations, Real Estate, Media &
  // Entertainment, Security Services, and Rental & Leasing (which has
  // its own dedicated asset-tracking module already) — none of these
  // genuinely run on warehouse/stock-level tracking as a core function.
  'Inventory & Warehouse': [
    'Trading & Distribution', 'Manufacturing Industries', 'Construction & Engineering',
    'Healthcare', 'Transport & Logistics', 'Agriculture', 'Mining & Natural Resources',
    'Hospitality', 'Automotive', 'Energy & Utilities', 'Beauty & Lifestyle',
    'E-Commerce & Digital Businesses', 'Import & Export', 'Cooperatives', 'Telecommunications',
    'Multi-Business Groups', 'Special Industry Solutions',
  ],
};

// A section not in SPECIALIZED_MODULES is universal — always applicable.
// A company with no Nature of Business set at all (still possible for
// any company created before this field became mandatory) shows every
// module rather than guessing — hiding something a real company already
// depends on because a field happens to be empty would be a far worse
// failure than showing one extra menu item to a business that doesn't
// need it.
export function isModuleApplicable(sectionName, natureOfBusiness) {
  const allowedList = SPECIALIZED_MODULES[sectionName];
  if (!allowedList) return true;
  if (!natureOfBusiness) return true;
  return allowedList.includes(natureOfBusiness);
}
