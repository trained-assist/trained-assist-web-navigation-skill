# Semantic element search

`web_find` first uses its local literal/token matcher. When it finds fewer than
three results and `WEB_NAV_SEMANTIC_ENDPOINT` is configured, it may ask the
semantic Worker to rank candidate navigation labels. It never sends page text,
URL, href, form values, cookies, input controls, or surrounding context. Only a
short intent and up to 40 visible button/link labels (each at most 100 chars)
are sent. Email-like, phone-like, secret-like and disabled controls are omitted.
The Worker returns candidate indices and cosine scores; it cannot trigger any
browser action. Unknown indices and invalid scores are discarded locally.

## Worker deployment

Deploy `workers/semantic-search.js` with `wrangler.semantic.jsonc`. The Worker
uses the Cloudflare Workers AI binding for `@cf/baai/bge-m3`; it has no Cloudflare
API token. Keep `workers.dev` disabled for general access by configuring a
Cloudflare Access application for the exact hostname/path `/v1/rank` and a
service-token-only allow policy before advertising the endpoint to clients.
Cloudflare Access credentials are service-client credentials, not Cloudflare
API tokens. Store them only in the MCP host's secret store as:

- `WEB_NAV_SEMANTIC_ENDPOINT`
- `WEB_NAV_ACCESS_CLIENT_ID`
- `WEB_NAV_ACCESS_CLIENT_SECRET`

Do not configure the MCP Worker secret until the Access service token has been
created and tested. Disable Worker observability/logging; the endpoint never
logs request content and responses are `no-store`. Enforce Cloudflare rate
limiting for the Access-protected route. The service fails closed with respect
to semantic ranking: missing credentials or any HTTP/model failure leaves the
local search result unchanged.

Cloudflare Access cannot be configured from the sandbox credential currently
available to this repository (Access API responds 403). Therefore this change
does not publish an unauthenticated endpoint. Configure Access, then deploy and
add the three MCP environment values through the host's trusted secret channel.
