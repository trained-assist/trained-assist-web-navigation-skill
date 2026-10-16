'use strict';

const MAX_QUERY_CHARS = 160;
const MAX_CANDIDATES = 40;
const MAX_LABEL_CHARS = 100;

function safeCandidateLabel(item) {
  if (!item || item.secret || item.disabled || !item.visible) return '';
  // Only send navigation-like controls. Never send editable controls, values,
  // URLs, or surrounding page text to the semantic service.
  if (!['a', 'button'].includes(String(item.tag || '').toLowerCase())) return '';
  const label = String(item.ariaLabel || item.title || item.alt || item.text || item.label || '').replace(/\s+/g, ' ').trim();
  if (!label || label.length > MAX_LABEL_CHARS) return '';
  if (/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\+?\d[\d ()-]{7,}\b|\b(?:password|passwd|secret|token|api[_-]?key|credential)\b)/i.test(label)) return '';
  return label;
}

function buildPayload(query, alternatives, items) {
  const intent = [query, ...(Array.isArray(alternatives) ? alternatives : [])]
    .map(value => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean).slice(0, 4).join(' / ').slice(0, MAX_QUERY_CHARS);
  if (!intent) return null;
  const candidates = [];
  for (let index = 0; index < (items || []).length && candidates.length < MAX_CANDIDATES; index += 1) {
    const label = safeCandidateLabel(items[index]);
    if (label) candidates.push({ index, label });
  }
  return candidates.length ? { intent, candidates } : null;
}

async function semanticRank(payload, { endpoint, accessClientId, accessClientSecret, fetchImpl = fetch, signal } = {}) {
  if (!payload || !endpoint || !accessClientId || !accessClientSecret) return null;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'CF-Access-Client-Id': accessClientId,
      'CF-Access-Client-Secret': accessClientSecret,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`semantic service returned HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.matches)) return null;
  const allowed = new Set(payload.candidates.map(candidate => candidate.index));
  return body.matches
    .filter(match => Number.isInteger(match.index) && allowed.has(match.index)
      && Number.isFinite(match.score) && match.score >= 0 && match.score <= 1)
    .slice(0, 5);
}

module.exports = { MAX_CANDIDATES, buildPayload, safeCandidateLabel, semanticRank };
