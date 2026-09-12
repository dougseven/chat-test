# Crew Chat Spike (P0)

This is the throwaway Spike 0 sandbox for the Copilot Crew Chat prototype. It
exists to answer one question before any UI work starts:

> Can Crew reliably determine who did what from structured Copilot SDK
> runtime events?

It does **not** build a chat UI, normalize events, or attempt any Crew
architecture. See `.github/agents/` for the three custom agents used in the
delegation test.

## Setup

```bash
cd spike
npm install
```

Requires Node.js ^20.19.0 or >=22.12.0, and that you're logged into the
GitHub Copilot CLI (or provide `GITHUB_TOKEN`/`gitHubToken`) so the SDK's
managed runtime can authenticate.

## Run the spike

```bash
npm run spike
# or, with a custom goal:
npm run spike -- "Research X, then write a short memo about it."
```

This will:

1. Start a `CopilotClient` pointed at the repo root (so the runtime
   auto-discovers `.github/agents/orchestrator.agent.md`,
   `researcher.agent.md`, and `writer.agent.md`).
2. Create a session with the `orchestrator` custom agent selected.
3. Send the default two-specialist demo goal (research + writing), which the
   orchestrator's restricted tool set forces it to delegate.
4. Record **every** raw SDK event, unmodified, to
   `spike/traces/raw-events-<timestamp>.ndjson` (one JSON object per line).

## What to look for in the trace

Per P0.3/P0.4, inspect the captured trace for:

- Orchestrator events vs. specialist/sub-agent events.
- Agent identifiers on each event (can you tell researcher from writer?).
- Delegation / sub-agent lifecycle events (`subagent.*`).
- Message events and streaming deltas, if present.
- Tool execution events.
- Parent/tool-call relationships, if present.

If specialist identity and lifecycle are reliably observable in the raw
event stream, proceed with SDK-native observation (P1). If not, fall back to
explicit backend-driven orchestration instead of parsing model-generated
conversational markers.

This directory is intentionally disposable: nothing here is meant to survive
into the eventual Crew Chat backend except the validated assumptions it
produces.
