// The LLM adapter is optional and must never change the facts of an answer.
// These tests use a mocked transport, so no Groq API key or network is required.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const llm = await import('../src/llm.js');

test('assistant stays deterministic when no Groq key is configured', async () => {
  delete process.env.GROQ_API_KEY;
  assert.equal(llm.llmEnabled(), false);
  assert.equal(await llm.phraseAnswer({ question: 'anything', bulletPoints: ['• claim'] }), null);
});

test('Groq requests use the OpenAI-compatible endpoint, key and configured model', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  process.env.GROQ_MODEL = 'llama-3.1-8b-instant';
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Grounded summary.' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const answer = await llm.phraseAnswer({ question: 'Why backoff?', bulletPoints: ['• backoff (high evidence)'] });
    assert.equal(answer, 'Grounded summary.');
    assert.equal(captured.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(captured.options.body);
    assert.equal(body.model, 'llama-3.1-8b-instant');
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /INSUFFICIENT_EVIDENCE/);
    assert.match(body.messages[1].content, /Why backoff\?/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  }
});

test('a refused or failed model call falls back to the deterministic answer', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'INSUFFICIENT_EVIDENCE' } }] }), { status: 200 });
    assert.equal(await llm.phraseAnswer({ question: 'q', bulletPoints: ['b'] }), null);

    globalThis.fetch = async () => new Response('{"error":"invalid api key"}', { status: 401 });
    assert.equal(await llm.phraseAnswer({ question: 'q', bulletPoints: ['b'] }), null);

    globalThis.fetch = async () => {
      throw new Error('network down');
    };
    assert.equal(await llm.phraseAnswer({ question: 'q', bulletPoints: ['b'] }), null);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  }
});
