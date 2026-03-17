import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ForegroundProcessRunner } from "../../src/adapters/process.ts";
import { ZaiApiKeyAdapter } from "../../src/contexts/deploy/infrastructure/adapters/zai-api-key.ts";

function makeProcessRunner(
  impl: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ) => Promise<{ stdout?: string; stderr?: string; exitCode: number }>
): ForegroundProcessRunner {
  return {
    run: async (command, args, options) => {
      const result = await impl(command, args, options);
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exitCode,
      };
    },
    runStreaming: async () => ({ exitCode: 0 }),
    runForeground: async () => ({ exitCode: 0 }),
  };
}

describe("ZaiApiKeyAdapter", () => {
  it("detects a working Z.AI coding endpoint for a GLM coding-plan key", async () => {
    const attemptedTargets: string[] = [];
    const adapter = new ZaiApiKeyAdapter(
      makeProcessRunner(async (command, args) => {
        assert.equal(command, "curl");
        const target = args.find((value) => value.startsWith("https://"));
        assert.ok(target);
        attemptedTargets.push(target);

        if (target === "https://api.z.ai/api/coding/paas/v4/chat/completions") {
          return {
            exitCode: 0,
            stdout: "{\"id\":\"probe\"}\n200",
          };
        }

        return {
          exitCode: 0,
          stdout: "{\"error\":\"insufficient_balance\"}\n402",
        };
      })
    );

    const endpoint = await adapter.detectEndpoint("glm-live-key");

    assert.deepEqual(endpoint, {
      id: "coding-global",
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
      defaultModel: "glm-4.7",
      label: "Global (Coding Plan)",
    });
    assert.equal(attemptedTargets[0], "https://api.z.ai/api/coding/paas/v4/chat/completions");
  });

  it("offers the Hermes-supported GLM model catalog with the preferred model first", () => {
    const adapter = new ZaiApiKeyAdapter(makeProcessRunner(async () => ({ exitCode: 1 })));

    const models = adapter.staticModelOptions("glm-4.7");

    assert.deepEqual(models.map((model) => model.value), [
      "glm-4.7",
      "glm-5",
      "glm-4.5",
      "glm-4.5-flash",
    ]);
    assert.ok(models.every((model) => model.providerKey === "zai"));
    assert.ok(models.every((model) => model.supportsReasoning === false));
  });
});
