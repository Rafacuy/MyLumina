const Together = require('together-ai');
const config = require('./config/config')
const  TOGETHER_API_KEY = config.togetherAiApiKey
const together = new Together({ apiKey: TOGETHER_API_KEY });

(async () => {
  try {
    const res = await together.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Wee, lu bisa bahasa indo?' }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    console.log(res.choices[0].message.content);
  } catch (err) {
    console.error("TOGETHER.AI ERROR:", err.response?.data || err.message);
  }
})();
