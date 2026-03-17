import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FlyAgentConsole } from "../../src/contexts/runtime/infrastructure/adapters/fly-agent-console.ts";
import type { ForegroundProcessRunner } from "../../src/adapters/process.ts";

describe("FlyAgentConsole", () => {
  it("opens Hermes over fly ssh console in the deployed app", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: ForegroundProcessRunner = {
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      runStreaming: async () => ({ exitCode: 0 }),
      runForeground: async (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0 };
      }
    };

    const adapter = new FlyAgentConsole(runner, { HOME: "" });
    const result = await adapter.openConsole("test-app", ["chat", "-q", "hello world"]);

    assert.deepEqual(result, { ok: true });
    assert.equal(calls[0]?.command, "fly");
    assert.deepEqual(calls[0]?.args.slice(0, 4), ["ssh", "console", "-a", "test-app"]);
    assert.equal(calls[0]?.args[4], "-C");
    assert.match(calls[0]?.args[5] ?? "", /\/opt\/hermes\/hermes-agent\/venv\/bin\/hermes/);
    assert.match(calls[0]?.args[5] ?? "", /chat/);
    assert.match(calls[0]?.args[5] ?? "", /hello world/);
  });
});
