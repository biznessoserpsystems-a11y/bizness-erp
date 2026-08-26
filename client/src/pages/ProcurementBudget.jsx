import ModuleBudget from '../components/ModuleBudget';

export default function ProcurementBudget() {
  return (
    <ModuleBudget
      title="Procurement Budget"
      scopeNote="Cost of Sales accounts only — the goods and materials Procurement purchases."
      accountFilter={(a) => a.account_subtype === 'cogs'}
    />
  );
}
