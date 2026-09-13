/**
 * Loads `.github/agents/*.agent.md` custom agent definitions and converts
 * them into the `CustomAgentConfig[]` shape the Copilot SDK expects.
 *
 * The SDK does *not* auto-discover `.agent.md` files from the working
 * directory (despite what earlier spike notes assumed) — custom agents must
 * be passed explicitly via `createSession({ customAgents })`. This module
 * bridges the two: it reads the simple YAML-ish frontmatter used by our
 * agent files (`name`, `description`, `tools`) and the markdown body (used
 * as the agent's `prompt`).
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { CustomAgentConfig } from "@github/copilot-sdk";

const FRONTMATTER_DELIMITER = "---";

/**
 * Strips a single layer of matching surrounding single or double quotes
 * from a YAML scalar, e.g. `"orchestrator"` -> `orchestrator`.
 */
function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

interface ParsedAgentFile {
  name: string;
  description?: string;
  tools?: string[];
  prompt: string;
}

/**
 * Parses the minimal frontmatter subset our agent files use: scalar
 * `key: value` pairs and single-level `key:` list blocks (`  - item`).
 * This intentionally isn't a general YAML parser — just enough for
 * `name`, `description`, and `tools`.
 */
function parseAgentFile(raw: string, filePath: string): ParsedAgentFile {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    throw new Error(`${filePath}: expected frontmatter starting with '---'`);
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER
  );
  if (closingIndex === -1) {
    throw new Error(`${filePath}: unterminated frontmatter block`);
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const body = lines
    .slice(closingIndex + 1)
    .join("\n")
    .trim();

  const values: Record<string, string | string[]> = {};
  let currentListKey: string | null = null;

  for (const line of frontmatterLines) {
    const listItemMatch = /^\s*-\s*(.+)$/.exec(line);
    if (listItemMatch && currentListKey) {
      const list = values[currentListKey];
      if (Array.isArray(list)) {
        list.push(unquote(listItemMatch[1].trim()));
      }
      continue;
    }

    const keyValueMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!keyValueMatch) continue;

    const [, key, rawValue] = keyValueMatch;
    const trimmedValue = rawValue.trim();
    if (trimmedValue === "") {
      values[key] = [];
      currentListKey = key;
    } else {
      values[key] = unquote(trimmedValue);
      currentListKey = null;
    }
  }

  const name = values.name;
  if (typeof name !== "string" || !name) {
    throw new Error(`${filePath}: frontmatter is missing required 'name'`);
  }

  const description = values.description;
  const tools = values.tools;

  return {
    name,
    description: typeof description === "string" ? description : undefined,
    tools: Array.isArray(tools) ? tools : undefined,
    prompt: body,
  };
}

/**
 * Reads every `*.agent.md` file directly inside `agentsDir` and returns
 * them as `CustomAgentConfig`s ready to pass to `client.createSession`.
 */
export async function loadCustomAgents(
  agentsDir: string
): Promise<CustomAgentConfig[]> {
  let entries: string[];
  try {
    entries = await readdir(agentsDir);
  } catch (error) {
    throw new Error(
      `failed to read agents directory ${agentsDir}: ${(error as Error).message}`
    );
  }

  const agentFiles = entries.filter((entry) => entry.endsWith(".agent.md")).sort();

  const agents: CustomAgentConfig[] = [];
  for (const fileName of agentFiles) {
    const filePath = path.join(agentsDir, fileName);
    const raw = await readFile(filePath, "utf8");
    const parsed = parseAgentFile(raw, filePath);
    agents.push({
      name: parsed.name,
      description: parsed.description,
      tools: parsed.tools,
      prompt: parsed.prompt,
    });
  }

  return agents;
}
