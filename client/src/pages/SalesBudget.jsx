import ModuleBudget from '../components/ModuleBudget';

export default function SalesBudget() {
  return (
    <ModuleBudget
      title="Sales Budget"
      scopeNote="Revenue accounts only — Sales & Distribution's targets."
      accountFilter={(a) => a.account_type === 'revenue'}
      higherIsBetter
    />
  );
}
