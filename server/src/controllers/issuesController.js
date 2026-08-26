const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { generateStructuredInsight } = require('../utils/aiInsight');

// POST /issues/explain { issueText }
// Same real, live call to Claude used throughout the Executive Dashboard
// Suite, structured the same four-part way as every other insight in
// this app — what happened, why, what's likely next, what management
// should do — via the shared generateStructuredInsight helper, but
// genuinely generic rather than another per-module endpoint: every
// Dashboard alert (compliance, receivables, payables, low stock,
// overdue tasks) already renders as a single line of plain text with
// the real numbers baked in, so there's nothing module-specific to
// query here; the alert text a person can already see on screen is the
// entire input. No new permission needed — explaining an alert someone
// can already see doesn't expose anything they couldn't already see.
const explainIssue = asyncHandler(async (req, res) => {
  const { issueText } = req.body;
  if (!issueText || typeof issueText !== 'string' || !issueText.trim()) {
    throw new ApiError(400, 'issueText is required');
  }
  // A generous but real cap — this only ever needs to hold one alert
  // line, not an essay; rejecting anything absurdly long is a cheap
  // guard against someone using this as a general-purpose AI proxy.
  if (issueText.length > 500) throw new ApiError(400, 'issueText is too long');

  const dataSummaryText = `This specific dashboard alert: "${issueText.trim()}"`;
  const result = await generateStructuredInsight('this one specific dashboard alert', dataSummaryText);
  res.json(result.available ? { available: true, explanation: result.insight } : result);
});

module.exports = { explainIssue };
