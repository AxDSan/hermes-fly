import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runConsoleCommand } from "../../src/commands/console.ts";
import { OpenConsoleUseCase } from "../../src/contexts/runtime/application/use-cases/open-console.ts";
import type { AgentConsolePort } from "../../src/contexts/runtime/application/ports/agent-console.port.ts";

function makeIO() {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    stdout: { write: (s: string) => { outLines.push(s); } },
    stderr: { write: (s: string) => { errLines.push(s); } },
    get outText() { return outLines.join(""); },
    get errText() { return errLines.join(""); }
  };
}

describe("runConsoleCommand", () => {
  it("opens the remote Hermes CLI for an explicit app", async () => {
    const calls: Array<{ appName: string; hermesArgs: string[] }> = [];
    const useCase = new OpenConsoleUseCase({
      openConsole: async (appName, hermesArgs) => {
        calls.push({ appName, hermesArgs });
        return { ok: true };
      }
    });
    const io = makeIO();

    const code = await runConsoleCommand(["-a", "test-app"], {
      useCase,
      env: { HOME: "" },
      ...io
    });

    assert.equal(code, 0);
    assert.deepEqual(calls, [{ appName: "test-app", hermesArgs: [] }]);
  });

  it("treats the first positional argument as the app name and forwards the rest to Hermes", async () => {
    const calls: Array<{ appName: string; hermesArgs: string[] }> = [];
    const useCase = new OpenConsoleUseCase({
      openConsole: async (appName, hermesArgs) => {
        calls.push({ appName, hermesArgs });
        return { ok: true };
      }
    });
    const io = makeIO();

    const code = await runConsoleCommand(["test-app", "chat", "-q", "hello"], {
      useCase,
      env: { HOME: "" },
      ...io
    });

    assert.equal(code, 0);
    assert.deepEqual(calls, [{ appName: "test-app", hermesArgs: ["chat", "-q", "hello"] }]);
  });

  it("returns a friendly error when no app can be resolved", async () => {
    const io = makeIO();

    const code = await runConsoleCommand([], {
      env: { HOME: "" },
      ...io
    });

    assert.equal(code, 1);
    assert.match(io.errText, /No app specified/);
  });

  it("returns a friendly error when flyctl is missing", async () => {
    const useCase = new OpenConsoleUseCase({
      openConsole: async () => ({ ok: false, error: "spawn fly ENOENT" })
    });
    const io = makeIO();

    const code = await runConsoleCommand(["-a", "test-app"], {
      useCase,
      env: { HOME: "" },
      ...io
    });

    assert.equal(code, 1);
    assert.match(io.errText, /Fly\.io CLI not found/);
  });
});

describe("OpenConsoleUseCase", () => {
  it("surfaces adapter failures as error results", async () => {
    const port: AgentConsolePort = {
      openConsole: async () => ({ ok: false, error: "boom" })
    };

    const useCase = new OpenConsoleUseCase(port);
    const result = await useCase.execute("test-app", []);

    assert.deepEqual(result, { kind: "error", message: "boom" });
  });
});
