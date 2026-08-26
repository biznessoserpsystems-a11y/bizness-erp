/**
 * The underlying permission catalog is granular and, deliberately, not
 * uniform - accounting has 11 distinct action permissions, some modules
 * (bcm, school, services) have a clean {view, manage} pair, and a few
 * (crm, tasks, calendar, communications) have only manage_* actions
 * with no dedicated view-only permission at all. This module maps that
 * real, uneven catalog onto a simpler per-module "No access / View /
 * Edit" picture for the role editor, without inventing a second,
 * competing permission system - every level here still resolves to the
 * exact same permission IDs the granular checkbox grid already uses.
 *
 * A permission is "view-tier" if its action is exactly "view" or starts
 * with "view_" (view, view_ledger, view_executive, view_all, ...).
 * Everything else (manage_*, approve_leave, run_depreciation, adjust,
 * stock_in, ...) is "edit-tier".
 */
export function isViewTier(action) {
  return action === 'view' || action.startsWith('view_');
}

/**
 * Groups the flat permission list by module and classifies each
 * module's permissions into view-tier and edit-tier IDs, and derives
 * which access levels are actually meaningful for that module - a
 * module with zero edit-tier permissions (e.g. dashboard) has no real
 * "Edit" beyond what "View" already grants, and a module with zero
 * view-tier permissions (e.g. crm, tasks) has no real read-only
 * option, so neither is offered as a false choice.
 */
export function groupPermissionsByModule(permissions) {
  const byModule = new Map();
  for (const p of permissions) {
    if (!byModule.has(p.module)) byModule.set(p.module, { module: p.module, permissions: [], viewTierIds: [], editTierIds: [] });
    const entry = byModule.get(p.module);
    entry.permissions.push(p);
    if (isViewTier(p.action)) entry.viewTierIds.push(p.id);
    else entry.editTierIds.push(p.id);
  }
  return Array.from(byModule.values())
    .map((entry) => ({
      ...entry,
      allIds: [...entry.viewTierIds, ...entry.editTierIds],
      availableLevels: [
        'none',
        ...(entry.viewTierIds.length ? ['view'] : []),
        ...(entry.editTierIds.length ? ['edit'] : []),
      ],
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

function sameIdSet(idsA, idsB) {
  if (idsA.length !== idsB.length) return false;
  const setB = new Set(idsB);
  return idsA.every((id) => setB.has(id));
}

/**
 * Given a module's permission grouping and the currently-selected
 * permission IDs (from the same state the granular checkbox grid
 * already reads and writes), derives which of the three levels the
 * current selection represents - or 'custom' if the selection is a
 * mix that doesn't cleanly correspond to any of the three, which can
 * genuinely happen for a role someone previously fine-tuned by hand in
 * the granular view. 'custom' is deliberately never silently collapsed
 * into one of the three; the UI shows it plainly and only normalizes
 * it once someone explicitly picks a level.
 */
export function deriveAccessLevel(moduleGroup, selectedIds) {
  const selected = new Set(selectedIds);
  const selectedInModule = moduleGroup.allIds.filter((id) => selected.has(id));

  if (selectedInModule.length === 0) return 'none';
  if (sameIdSet(selectedInModule, moduleGroup.allIds)) return 'edit';
  if (moduleGroup.viewTierIds.length && sameIdSet(selectedInModule, moduleGroup.viewTierIds)) return 'view';
  return 'custom';
}

/**
 * Returns the exact set of permission IDs a given level should select
 * for a module - 'edit' grants everything (view-tier included, since
 * being able to edit something without being able to view it isn't a
 * meaningful real-world state), 'view' grants only the view-tier IDs,
 * 'none' grants nothing.
 */
export function idsForLevel(moduleGroup, level) {
  if (level === 'edit') return moduleGroup.allIds;
  if (level === 'view') return moduleGroup.viewTierIds;
  return [];
}

/**
 * Applies a level change for one module to the full, current selection
 * across every module, returning the new full ID list - removes that
 * module's own IDs first (regardless of the level it was previously at,
 * including 'custom') so it never leaves stray IDs behind, then adds
 * back exactly the IDs the new level calls for.
 */
export function applyModuleLevel(moduleGroup, currentSelectedIds, newLevel) {
  const withoutThisModule = currentSelectedIds.filter((id) => !moduleGroup.allIds.includes(id));
  return [...withoutThisModule, ...idsForLevel(moduleGroup, newLevel)];
}
