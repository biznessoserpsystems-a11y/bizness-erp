const ApiError = require('./ApiError');

// The whole point of moving business data into an "insight" is that a
// figure on its own doesn't tell anyone what to do about it. Every
// AI-generated insight in this app — the four suite dashboards, the BI
// Report Builder's explainer — now follows the same four-part structure
// rather than each endpoint inventing its own loose "3-4 sentence
// summary" prompt: what actually happened, why it happened, what's
// likely to happen next, and what management should actually do about
// it. A number alone is descriptive; this is what turns it into
// something a manager can act on.
//
// Asks Claude for strict JSON with exactly these four keys, rather than
// free text formatted "in the style of" four sections — parsing loose
// prose for four labeled parts is fragile and would silently degrade
// back into one paragraph the moment the model's phrasing drifted.
function buildStructuredPrompt(domainLabel, dataSummaryText) {
  return `You are a business analyst for a Ghanaian SME's ERP system. Given this real, current snapshot of ${domainLabel} data, respond with ONLY a JSON object (no markdown, no code fences, no preamble) with exactly these four keys:

{
  "whatHappened": "1-2 sentences stating the concrete, factual current state using the real numbers given — what the data actually shows right now.",
  "why": "1-2 sentences on the most likely driver behind that state, reasoned from the data given — do not invent a cause the data doesn't support.",
  "whatsLikely": "1-2 sentences on what will probably happen next if nothing changes — a genuine forward-looking projection, not a restatement of whatHappened.",
  "whatToDo": "1-2 sentences of a concrete, specific action management could take — not generic advice like \\"monitor closely\\", something an actual person could go do this week."
}

If the data doesn't support a confident answer for one of these (e.g. too little history to project a trend), say so honestly in that field rather than inventing certainty — "Not enough data yet to project a trend" is a valid, honest answer.

Data:
${dataSummaryText}`;
}

// Calls the real Anthropic API and parses the four-part JSON response.
// Returns { available: false, message } when no key is configured —
// the same honest degradation every AI endpoint in this app already
// uses — or { available: true, insight: { whatHappened, why,
// whatsLikely, whatToDo } } on success. Throws ApiError on a genuine
// failure to reach the API or a response that isn't valid JSON, so the
// caller's asyncHandler turns it into a real error response rather
// than silently returning something malformed.
async function generateStructuredInsight(domainLabel, dataSummaryText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { available: false, message: 'AI insights require ANTHROPIC_API_KEY to be set in the server\'s .env file.' };
  }

  const prompt = buildStructuredPrompt(domainLabel, dataSummaryText);

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    throw new ApiError(502, `Could not reach the AI service: ${err.message}`);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new ApiError(502, `AI service returned an error (${response.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

  let parsed;
  try {
    // Strip markdown code fences defensively — the prompt asks for none,
    // but models occasionally add them anyway, and stripping them is
    // cheap insurance against an otherwise-valid response failing to parse.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new ApiError(502, 'AI response was not valid structured output.');
  }

  const { whatHappened, why, whatsLikely, whatToDo } = parsed;
  if (!whatHappened || !why || !whatsLikely || !whatToDo) {
    throw new ApiError(502, 'AI response was missing one of the four expected parts.');
  }

  return { available: true, insight: { whatHappened, why, whatsLikely, whatToDo } };
}

module.exports = { generateStructuredInsight };
