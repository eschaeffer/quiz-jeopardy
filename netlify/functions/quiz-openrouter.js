async function createChatCompletion({ apiKey, model, messages, temperature, maxTokens, reasoning }) {
  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(reasoning ? { reasoning } : {})
    }),
  });
}

module.exports = {
  createChatCompletion,
};
