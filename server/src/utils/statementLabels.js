/**
 * A negative result is a loss, not a "negative profit". Picks the wording
 * from the sign of the figure so a statement's label can never disagree
 * with the number printed next to it.
 *
 *   profitOrLoss(-5258.5, 'Net Profit for the Period', 'Net Loss for the Period')
 *   // => 'Net Loss for the Period'
 *
 * Zero (break-even) takes the profit wording.
 */
function profitOrLoss(value, profitLabel, lossLabel) {
  return Number(value) < 0 ? lossLabel : profitLabel;
}

module.exports = { profitOrLoss };
