const MAX_BODY_BYTES = 12_000;
const MAX_QUERY_CHARS = 160;
const MAX_CANDIDATES = 40;
const MAX_LABEL_CHARS = 100;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function validate(input) {
  if (!input || typeof input.intent !== 'string' || !input.intent.trim()
      || input.intent.length > MAX_QUERY_CHARS || !Array.isArray(input.candidates)
      || input.candidates.length < 1 || input.candidates.length > MAX_CANDIDATES) return false;
  return input.candidates.every(candidate => candidate && Number.isInteger(candidate.index)
    && candidate.index >= 0 && typeof candidate.label === 'string'
    && candidate.label.length > 0 && candidate.label.length <= MAX_LABEL_CHARS);
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const url = new URL(request.url);
    if (url.pathname !== '/v1/rank') return json({ error: 'not_found' }, 404);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'unsupported_media_type' }, 415);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
    let input;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
      input = JSON.parse(raw);
    } catch { return json({ error: 'invalid_json' }, 400); }
    if (!validate(input)) return json({ error: 'invalid_payload' }, 400);

    try {
      const vectors = await env.AI.run('@cf/baai/bge-m3', {
        text: [input.intent, ...input.candidates.map(candidate => candidate.label)],
      });
      const query = vectors?.data?.[0];
      if (!Array.isArray(query)) return json({ error: 'model_unavailable' }, 502);
      const matches = input.candidates.map((candidate, offset) => {
        const vector = vectors.data[offset + 1];
        if (!Array.isArray(vector) || vector.length !== query.length) return null;
        let dot = 0;
        let aa = 0;
        let bb = 0;
        for (let i = 0; i < query.length; i += 1) {
          dot += query[i] * vector[i]; aa += query[i] * query[i]; bb += vector[i] * vector[i];
        }
        const cosine = aa && bb ? dot / Math.sqrt(aa * bb) : 0;
        return { index: candidate.index, score: Math.max(0, Math.min(1, Number(cosine.toFixed(4)))) };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 5);
      return json({ matches });
    } catch {
      // No request or model text is logged.
      return json({ error: 'model_unavailable' }, 502);
    }
  },
};

export { validate };
