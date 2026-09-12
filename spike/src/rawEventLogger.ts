/**
 * Raw event capture for Spike 0 (P0.3).
 *
 * Deliberately does *no* normalization or interpretation of the SDK's
 * events — that mapping is P1's job (CrewEvent + the SDK -> CrewEvent
 * normalizer). This logger only appends the exact, unmodified event objects
 * emitted by the Copilot SDK, one JSON object per line (NDJSON), so the trace
 * can be diffed, replayed, and inspected by hand.
 */
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";

export class RawEventLogger {
  readonly filePath: string;
  private readonly stream: WriteStream;
  private count = 0;

  constructor(repoRoot: string, outDir = "spike/traces") {
    const dir = path.join(repoRoot, outDir);
    mkdirSync(dir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.filePath = path.join(dir, `raw-events-${timestamp}.ndjson`);
    this.stream = createWriteStream(this.filePath, { flags: "a" });
  }

  get eventCount(): number {
    return this.count;
  }

  /** Append one raw SDK event, exactly as received, as a single JSON line. */
  record(event: unknown): void {
    this.count += 1;
    const line = JSON.stringify({
      capturedAt: new Date().toISOString(),
      sequence: this.count,
      event,
    });
    this.stream.write(line + "\n");
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.end((err: Error | null | undefined) =>
        err ? reject(err) : resolve()
      );
    });
  }
}
