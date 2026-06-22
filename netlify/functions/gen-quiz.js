exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const { topic, categories, questionsPerCategory } = JSON.parse(event.body);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a quiz generator. Return valid JSON only, no markdown, no code fences.'
        },
        {
          role: 'user',
          content: `Generate a trivia quiz about "${topic}" with ${categories} categories and ${questionsPerCategory} questions per category. Return as JSON: { "categories": [{ "name": "...", "questions": [{ "value": 100, "question": "...", "answer": "..." }] }] }`
        }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: 'OpenRouter API error', details: err }),
    };
  }

  const data = await response.json();

  try {
    let content = data.choices[0].message.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    const quiz = JSON.parse(content);
    return {
      statusCode: 200,
      body: JSON.stringify(quiz),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to parse quiz JSON', raw: data.choices[0].message.content }),
    };
  }
};
