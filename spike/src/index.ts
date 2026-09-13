/**
 * Spike 0 — Copilot Crew Chat Prototype
 *
 * Goal: prove the runtime contract before building any UI.
 *
 *  - P0.1: establish a Copilot SDK session that loads the three
 *    `.github/agents/*.agent.md` custom agents (orchestrator, researcher,
 *    writer).
 *  - P0.2: force delegation by giving the orchestrator a goal that requires
 *    both specialists, and by restricting its tools so it cannot quietly do
 *    the work itself (enforced in orchestrator.agent.md).
 *  - P0.3: record the complete raw SDK event stream, unmodified, so it can be
 *    inspected for specialist identity and delegation/lifecycle shape.
 *
 * Nothing here normalizes events into `CrewEvent`s (that's P1). This script
 * only proves the runtime contract and captures raw evidence.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { RawEventLogger } from "./rawEventLogger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root: two levels up from spike/src, where .github/agents/ lives. */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * The canonical two-specialist demo goal (P4.1). Deliberately structured so
 * it cannot be satisfied without both research and writing.
 */
const DEFAULT_GOAL =
  "Research the tradeoffs between REST and GraphQL for a public API, then " +
  "write a short, decision-ready recommendation memo for a team choosing " +
  "between them.";

/**
 * Upper bound on how long we wait for the orchestrator's full run (including
 * delegation to both specialists) to finish, so a hung session can't leave
 * the process stuck and skip cleanup in the `finally` block below.
 */
const SEND_TIMEOUT_MS = 10 * 60 * 1000;

async function main(): Promise<void> {
  const goal = process.argv.slice(2).join(" ").trim() || DEFAULT_GOAL;

  const logger = new RawEventLogger(REPO_ROOT);
  console.log(`[spike] repo root: ${REPO_ROOT}`);
  console.log(`[spike] raw event trace: ${logger.filePath}`);
  console.log(`[spike] goal: ${goal}`);

  const client = new CopilotClient({
    workingDirectory: REPO_ROOT,
  });

  await client.start();
  console.log("[spike] Copilot client started");

  const session = await client.createSession({
    agent: "orchestrator",
    onPermissionRequest: approveAll,
    includeSubAgentStreamingEvents: true,
  });
  console.log(`[spike] session created: ${session.sessionId}`);

  // P0.3: capture every raw event, unmodified, before any normalization.
  const unsubscribe = session.on((event) => {
    logger.record(event);
  });

  try {
    // sendAndWait resolves once *this* prompt's turn produces its assistant
    // response, rather than racing an independent `session.idle` listener
    // that could fire early (e.g. from unrelated initialization idling).
    const response = await session.sendAndWait(goal, SEND_TIMEOUT_MS);
    if (!response) {
      console.warn("[spike] no assistant response received before timeout");
      process.exitCode = 1;
    }
  } finally {
    unsubscribe();
    await logger.close();
    await session.disconnect();
    await client.stop();
  }

  console.log(`[spike] done. ${logger.eventCount} raw events captured.`);
  console.log(`[spike] inspect the trace at: ${logger.filePath}`);
}

main().catch((error) => {
  console.error("[spike] fatal error:", error);
  process.exitCode = 1;
});
