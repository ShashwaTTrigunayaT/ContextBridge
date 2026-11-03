// Evidence-grounded handover assistant (blueprint §5 module 8).
// Answers come only from the approved snapshot. If the snapshot does not support
// an answer, the assistant says so instead of inventing one.

import { all, get, parseJson } from './db.js';
import { approvedSnapshot } from './handover.js';
import { llmEnabled, phraseAnswer, llmModel } from './llm.js';
import { shorten, significantTerms } from './extract.js';

const INTENTS = [
  { key: 'nextActions', patterns: [/work on first/i, /\bstart\b/i, /priorit/i, /next step/i, /what should i do/i] },
  { key: 'unfinishedWork', patterns: [/unfinished/i, /remaining/i, /\bleft\b/i, /\bopen\b/i, /not done/i] },
  { key: 'decisions', patterns: [/why/i, /decision/i, /\bchose\b/i, /reason/i, /architecture/i] },
  { key: 'risks', patterns: [/risk/i, /danger/i, /break/i, /concern/i, /double[- ]charg/i] },
  { key: 'dependencies', patterns: [/depend/i, /integration/i, /requires/i, /blocked/i] },
  { key: 'responsibilities', patterns: [/\bwho\b/i, /owner/i, /maintain/i, /assigned/i] },
];

const SECTION_TO_INTENT = {
  nextActions: 'nextActions',
  unfinishedWork: 'unfinishedWork',
  decisions: 'decisions',
  risks: 'risks',
  dependencies: 'dependencies',
  responsibilities: 'responsibilities',
};

function flatten(content) {
  const items = [];
  for (const [section, list] of Object.entries(content.sections ?? {})) {
    for (const item of list) items.push({ ...item, section });
  }
  return items;
}

function detectIntent(question) {
  for (const intent of INTENTS) {
    if (intent.patterns.some((pattern) => pattern.test(question))) return intent.key;
  }
  return null;
}

function scoreItem(item, terms, intent) {
  const haystack = `${item.text} ${item.component ?? ''} ${item.evidence.map((evidence) => evidence.excerpt).join(' ')}`.toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 1;
  if (intent && SECTION_TO_INTENT[item.section] === intent) score += 3;
  if (item.evidenceStrength === 'high') score += 0.5;
  if (item.verification === 'verified' || item.verification === 'edited') score += 0.5;
  return score;
}

export async function answerQuestion({ projectId, question }) {
  const snapshot = approvedSnapshot(projectId);
  if (!snapshot) {
    return {
      insufficient: true,
      reason: 'no_approved_handover',
      answer:
        'There is no approved handover for this project yet. A reviewer must approve the draft before this workspace can answer questions.',
      citations: [],
    };
  }

  const content = parseJson(snapshot.content, {});
  const items = flatten(content);
  if (items.length === 0) {
    return { insufficient: true, reason: 'empty_handover', answer: 'The approved handover contains no items to ground an answer.', citations: [] };
  }

  const terms = significantTerms(question);
  const intent = detectIntent(question);
  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, terms, intent) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const threshold = intent ? 2 : 2;
  if (!best || best.score < threshold) {
    return {
      insufficient: true,
      reason: 'insufficient_evidence',
      answer:
        `The approved handover does not contain evidence for that question. ` +
        `Try asking about unfinished work, decisions, risks, dependencies or next actions.`,
      citations: [],
    };
  }

  // Keep the answer short and traceable: at most four grounded statements.
  const chosen = ranked.filter((entry) => entry.score >= threshold && entry.score >= best.score - 1.5).slice(0, 4).map((entry) => entry.item);

  const bullets = chosen.map((item) => {
    const verification = item.verification === 'pending' ? 'unverified' : item.verification;
    return `• ${item.text} (${item.evidenceStrength} evidence, ${verification})`;
  });

  let answer = bullets.join('\n');
  if (llmEnabled()) {
    const phrased = await phraseAnswer({ question, bulletPoints: bullets });
    if (phrased) answer = `${phrased}\n\n${answer}`;
  }

  const citations = chosen.map((item) => ({
    claimId: item.id,
    text: shorten(item.text, 200),
    verification: item.verification,
    evidenceStrength: item.evidenceStrength,
    evidence: item.evidence.slice(0, 2).map((evidence) => ({
      sourceName: evidence.sourceName,
      location: evidence.location,
      excerpt: shorten(evidence.excerpt, 220),
    })),
  }));

  return {
    insufficient: false,
    answer,
    intent,
    model: llmEnabled() ? llmModel() : 'deterministic-retrieval',
    citations,
  };
}

export function auditTrail(projectId, limit = 50) {
  return all(
    `SELECT a.*, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.project_id = ?
      ORDER BY a.created_at DESC LIMIT ?`,
    projectId,
    limit,
  );
}

export function projectRecord(projectId) {
  return get('SELECT * FROM projects WHERE id = ?', projectId);
}
