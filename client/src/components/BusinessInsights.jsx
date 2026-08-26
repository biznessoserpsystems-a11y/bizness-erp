import { IconSparkle } from './icons';

/**
 * "AI Business Insight" — a deterministic, rule-based read of the metrics
 * already on the dashboard (no external model call). It surfaces the same
 * kind of thing a controller scanning the numbers would flag first: margin
 * compression, cash going the wrong way, concentration risk, budget
 * overruns, and aging receivables. Framed as "AI" for the audience this
 * dashboard is built for, but it's plain, auditable logic — every insight
 * below can be traced back to a single comparison over real numbers.
 *
 * Each insight: { severity: 'warning' | 'success' | 'info', text }
 */
export function generateInsights({
  financeSeries,
  cashFlowSeries,
  agingBuckets,
  receivablesTotal,
  topCustomers,
  branchSales,
  budgetVsActual,
  lowStockCount,
  money,
}) {
  const insights = [];
  const fmtPct = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

  // --- Revenue & expense trend, month over month ---
  if (financeSeries && financeSeries.length >= 2) {
    const latest = financeSeries[financeSeries.length - 1];
    const prev = financeSeries[financeSeries.length - 2];

    if (prev.Revenue) {
      const revChange = ((latest.Revenue - prev.Revenue) / Math.abs(prev.Revenue)) * 100;
      if (revChange <= -8) {
        insights.push({ severity: 'warning', text: `Revenue fell ${fmtPct(revChange)} vs last month (${money(latest.Revenue)} vs ${money(prev.Revenue)}).` });
      } else if (revChange >= 8) {
        insights.push({ severity: 'success', text: `Revenue is up ${fmtPct(revChange)} vs last month — momentum is building.` });
      }
    }

    if (prev.Expenses && latest.Revenue) {
      const expChange = ((latest.Expenses - prev.Expenses) / Math.abs(prev.Expenses)) * 100;
      const revChange = prev.Revenue ? ((latest.Revenue - prev.Revenue) / Math.abs(prev.Revenue)) * 100 : 0;
      if (expChange - revChange >= 10) {
        insights.push({ severity: 'warning', text: `Expenses are growing faster than revenue this month (${fmtPct(expChange)} vs ${fmtPct(revChange)}) — margin is compressing.` });
      }
    }

    if (latest.Revenue > 0 && latest.Profit < 0) {
      insights.push({ severity: 'warning', text: `Operating at a loss this month: ${money(latest.Profit)} net, despite ${money(latest.Revenue)} in revenue.` });
    }
  }

  // --- Cash flow direction ---
  if (cashFlowSeries && cashFlowSeries.length >= 1) {
    const latestCash = cashFlowSeries[cashFlowSeries.length - 1];
    if (latestCash && Number(latestCash.net) < 0) {
      insights.push({ severity: 'warning', text: `Net cash outflow of ${money(Math.abs(latestCash.net))} last month — more went out of bank accounts than came in.` });
    }
  }

  // --- Receivables aging ---
  if (agingBuckets && receivablesTotal) {
    const over90 = Number(agingBuckets.over90 || 0);
    const share = receivablesTotal ? (over90 / receivablesTotal) * 100 : 0;
    if (over90 > 0 && share >= 15) {
      insights.push({ severity: 'warning', text: `${share.toFixed(0)}% of outstanding receivables (${money(over90)}) is over 90 days overdue — worth a collections push.` });
    }
  }

  // --- Customer concentration ---
  if (topCustomers && topCustomers.length >= 2) {
    const total = topCustomers.reduce((s, c) => s + Number(c.revenue), 0);
    const top = topCustomers[0];
    const share = total ? (Number(top.revenue) / total) * 100 : 0;
    if (share >= 30) {
      insights.push({ severity: 'info', text: `${top.name} accounts for ${share.toFixed(0)}% of tracked revenue — a concentration worth watching if that relationship changes.` });
    }
  }

  // --- Branch performance spread ---
  if (branchSales && branchSales.length >= 2) {
    const total = branchSales.reduce((s, b) => s + Number(b.revenue), 0);
    const top = branchSales[0];
    const bottom = branchSales[branchSales.length - 1];
    if (total > 0) {
      const topShare = (Number(top.revenue) / total) * 100;
      if (topShare >= 50) {
        insights.push({ severity: 'info', text: `${top.branch_name} alone drives ${topShare.toFixed(0)}% of sales — the other branches have room to catch up.` });
      } else if (Number(bottom.revenue) === 0) {
        insights.push({ severity: 'info', text: `${bottom.branch_name} recorded no sales in this period.` });
      }
    }
  }

  // --- Budget vs actual ---
  if (budgetVsActual && budgetVsActual.length) {
    const expenseRow = budgetVsActual.find((r) => r.name === 'Expense');
    if (expenseRow && expenseRow.Budgeted > 0) {
      const overBy = ((expenseRow.Actual - expenseRow.Budgeted) / expenseRow.Budgeted) * 100;
      if (overBy >= 10) {
        insights.push({ severity: 'warning', text: `Expenses are tracking ${overBy.toFixed(0)}% over budget (${money(expenseRow.Actual)} actual vs ${money(expenseRow.Budgeted)} budgeted).` });
      }
    }
    const revenueRow = budgetVsActual.find((r) => r.name === 'Revenue');
    if (revenueRow && revenueRow.Budgeted > 0) {
      const aheadBy = ((revenueRow.Actual - revenueRow.Budgeted) / revenueRow.Budgeted) * 100;
      if (aheadBy >= 10) {
        insights.push({ severity: 'success', text: `Revenue is ${aheadBy.toFixed(0)}% ahead of budget (${money(revenueRow.Actual)} actual vs ${money(revenueRow.Budgeted)} budgeted).` });
      }
    }
  }

  // --- Inventory ---
  if (lowStockCount) {
    insights.push({ severity: 'info', text: `${lowStockCount} product${lowStockCount === 1 ? ' is' : 's are'} at or below reorder level.` });
  }

  if (insights.length === 0) {
    insights.push({ severity: 'success', text: 'No unusual patterns detected in revenue, cash, receivables, or budget this period.' });
  }

  // Warnings first, then positives, then general info — most actionable up top.
  const order = { warning: 0, success: 1, info: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5);
}

export default function BusinessInsights({ loading, insights }) {
  return (
    <div className="card insights-ai-card">
      <div className="card-header">
        <h2>
          <IconSparkle className="insights-ai-icon" /> AI Business Insight
        </h2>
      </div>
      {loading ? (
        <p className="dashboard-empty-note">Analyzing this period's numbers…</p>
      ) : (
        <ul className="insight-list">
          {insights.map((ins, i) => (
            <li key={i} className={`insight-item insight-${ins.severity}`}>
              <span className="insight-dot" />
              <span>{ins.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="insight-disclaimer">Generated from this dashboard's own numbers — not a live data feed.</p>
    </div>
  );
}
