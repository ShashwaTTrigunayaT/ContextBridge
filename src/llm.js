// Optional LLM adapter backed by Groq's OpenAI-compatible chat completions API.
//
// The product works without it: every claim, gap and answer has a deterministic
// path. When a key is configured, the assistant may rephrase an already-grounded
// answer, but the model is never allowed to add facts.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

export function llmEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function llmModel() {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

export async function phraseAnswer({ question, bulletPoints }) {
  if (!llmEnabled()) return null;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content:
              'You summarise an approved project handover. Use only the bullet points provided. ' +
              'Never add facts, names, numbers or recommendations that are not in the bullets. ' +
              'If the bullets do not answer the question, reply exactly: INSUFFICIENT_EVIDENCE',
          },
          { role: 'user', content: `Question: ${question}\n\nApproved evidence:\n${bulletPoints.join('\n')}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text || text.includes('INSUFFICIENT_EVIDENCE')) return null;
    return text;
  } catch {
    // Network failure, timeout or bad key: fall back to the deterministic answer.
    return null;
  }
}
