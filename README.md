# trained-assist-web-navigation-skill

Web-navigation domain skill — MCP server mounted by
[trained-assist-agent](https://github.com/trained-assist/trained-assist-agent)
as the `web-navigation-skills` sibling.

Provides the `web_*` methods ported from legacy `src/web-ops.js`
(legacy-trained-assist-agent PR #2012): open/find/click/fill/login/state/screenshot/ask/text.

Runtime: Playwright Chromium. Credentials are read from the profile credential
store and never returned to the model.

## Host provider adapter

`src/host-provider.js` exposes `createHostProvider({ version })` for
`trained-assist-mcp-host`; `version` must be the pinned 40-character source commit.
It adapts all `web_*` handlers with `run.signal` / `run.profileId` context.
