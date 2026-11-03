// Optional LLM adapter backed by Groq's OpenAI-compatible chat completions API.
//
// The product works without it: every claim, gap and answer has a deterministic
// path. When a key is configured, the model may rephrase an already-grounded
// answer and propose extra claims from the records. It is never allowed to add
// facts: proposed claims keep their origin record and a reviewer still approves
// them, and a failed model call leaves the deterministic result untouched.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

export const MODEL_CLAIM_CATEGORIES = [
  'decision',
  'completed',
  'in_progress',
  'unfinished',
  'blocker',
  'dependency',
  'risk',
  'responsibility',
  'question',
  'next_action',
];

const ASSESSMENT_VERDICTS = new Set(['supported', 'weak', 'conflicting', 'unsupported']);

export function llmEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function llmModel() {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

// Model-assisted extraction is opt-in alongside the assistant: an operator who
// only wants deterministic extraction can set LLM_EXTRACTION=false.
export function extractionEnabled() {
  return llmEnabled() && process.env.LLM_EXTRACTION !== 'false';
}

async function chat({ messages, maxTokens = 400, temperature = 0.2, jsonMode = false, timeout = 15000 }) {
  if (!llmEnabled()) return null;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    // Network failure, timeout or bad key: callers fall back to deterministic output.
    return null;
  }
}

export async function phraseAnswer({ question, bulletPoints }) {
  if (!llmEnabled()) return null;
  const text = await chat({
    temperature: 0.2,
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
  });
  if (!text || text.includes('INSUFFICIENT_EVIDENCE')) return null;
  return text;
}

function parseJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// Ask the model for claims the pattern rules miss — rationale behind a decision,
// what depends on what, and context that reads as ambiguous. Every proposed claim
// must name the record it came from; records the caller did not send are dropped.
export async function extractClaimsWithModel({ projectName, records }) {
  if (!extractionEnabled() || !records.length) return [];
  const digest = records
    .map(
      (record) =>
        `[${record.id}] ${record.type}${record.state ? ` (${record.state})` : ''}\n` +
        `Title: ${record.title ?? '(none)'}\n` +
        `Body: ${record.body || '(no body)'}`,
    )
    .join('\n\n');

  const text = await chat({
    jsonMode: true,
    temperature: 0.1,
    maxTokens: 1600,
    timeout: 25000,
    messages: [
      {
        role: 'system',
        content:
          'You extract project knowledge for an engineering handover. Use only the records given.\n' +
          'Focus on what pattern matching misses: why a decision was made, what depends on what, ' +
          'ownership implied by the text, and context that is ambiguous or contradictory.\n' +
          'Rules: never invent a record, name, number or module. Quote or closely paraphrase the record. ' +
          'Each claim must name one recordId from the input. Categories allowed: ' +
          `${MODEL_CLAIM_CATEGORIES.join(', ')}. ` +
          'Skip anything already obvious from a merged pull request title or a plain status update. ' +
          'Return JSON only: {"claims":[{"recordId":"rec_...","category":"decision","text":"<=320 chars","rationale":"why the record supports this"}]}. ' +
          'Return {"claims":[]} when nothing is genuinely extractable.',
      },
      { role: 'user', content: `Project: ${projectName}\n\nRecords:\n${digest}` },
    ],
  });

  const payload = parseJsonObject(text);
  if (!payload || !Array.isArray(payload.claims)) return [];
  return payload.claims.slice(0, 20);
}

// An advisory second opinion on whether the excerpts actually support a claim.
// It never changes the claim; a reviewer still decides.
export async function assessClaimWithModel({ claim, evidence }) {
  if (!extractionEnabled()) return null;
  const excerpts = evidence
    .slice(0, 4)
    .map((item, index) => `${index + 1}. ${item.sourceName ?? 'source'} — ${item.location ?? ''}\n${item.excerpt ?? ''}`)
    .join('\n\n');

  const text = await chat({
    jsonMode: true,
    temperature: 0,
    maxTokens: 500,
    timeout: 20000,
    messages: [
      {
        role: 'system',
        content:
          'You audit one claim in an engineering handover against its evidence. Judge only whether the excerpts support the claim as written.\n' +
          'verdict is one of: supported (the excerpts state it), weak (partly supported, missing detail), ' +
          'conflicting (excerpts disagree), unsupported (the excerpts do not say it).\n' +
          'Do not rewrite the claim and do not add facts. Return JSON only: ' +
          '{"verdict":"weak","confidence":0.6,"rationale":"<=240 chars","missingEvidence":"what would settle it, or empty"}.',
      },
      {
        role: 'user',
        content: `Claim (${claim.category ?? 'unknown'}): ${claim.text}\n\nEvidence excerpts:\n${excerpts || '(none)'}`,
      },
    ],
  });

  const payload = parseJsonObject(text);
  if (!payload || !ASSESSMENT_VERDICTS.has(payload.verdict)) return null;
  const confidence = Number(payload.confidence);
  return {
    verdict: payload.verdict,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
    rationale: String(payload.rationale ?? '').slice(0, 600),
    missingEvidence: String(payload.missingEvidence ?? '').slice(0, 400),
  };
}
