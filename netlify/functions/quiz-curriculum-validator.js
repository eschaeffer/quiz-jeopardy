const { createChatCompletion } = require('./quiz-openrouter');
const { parseModelJsonContent } = require('./quiz-generation-utils');

async function requestNarrowTopicValidation({ apiKey, model, courseCode, subjectArea, focusArea, narrowTopic, sampledExpectations }) {
  const expectationLines = (sampledExpectations || []).map((expectation) => (
    `- ${expectation.expectation_code} (${expectation.strand_name}): ${expectation.expectation_text}`
  )).join('\n');

  const prompt = `Determine whether the optional narrow topic is appropriately aligned with the selected course focus area.

Course: ${courseCode} (${subjectArea})
Focus area: ${focusArea.name}
Focus area description: ${focusArea.description}
Optional narrow topic: ${narrowTopic}

Relevant curriculum expectations:
${expectationLines || '- None supplied'}

Return JSON only in this exact shape:
{
  "aligned": true,
  "reason": "short explanation"
}

Set "aligned" to true only if the narrow topic is clearly a sensible refinement of the selected focus area. If it is off-topic, misleading, or likely to derail generation away from the focus area, set it to false.`;

  const response = await createChatCompletion({
    apiKey,
    model,
    messages: [
      { role: 'system', content: 'You validate curriculum topic refinements. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    maxTokens: 300,
  });

  const rawText = await response.text();
  let jsonResponse;
  try {
    jsonResponse = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new Error(`Narrow-topic validator returned non-JSON API response: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(jsonResponse?.error?.message || jsonResponse?.message || response.statusText || 'Narrow-topic validator request failed');
  }

  const content = jsonResponse?.choices?.[0]?.message?.content || '';
  const parsed = parseModelJsonContent(content);
  return {
    aligned: parsed?.aligned === true,
    reason: typeof parsed?.reason === 'string' ? parsed.reason.trim() : '',
    routedModel: jsonResponse.model || model,
    usage: jsonResponse.usage || null,
  };
}

module.exports = {
  requestNarrowTopicValidation,
};
