import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);

describe("Z.AI sitecustomize bootstrap", () => {
  it("injects thinking disabled into run_agent kwargs when the deploy flag is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-fly-sitecustomize-"));

    try {
      const templatePath = join(process.cwd(), "templates", "sitecustomize.py");
      const sitecustomize = await readFile(templatePath, "utf8");
      await writeFile(join(root, "sitecustomize.py"), sitecustomize, "utf8");
      await writeFile(join(root, "run_agent.py"), [
        "class AIAgent:",
        "    def __init__(self):",
        "        self.provider = 'zai'",
        "        self.base_url = 'https://api.z.ai/api/coding/paas/v4'",
        "        self.model = 'glm-4.7'",
        "",
        "    def _build_api_kwargs(self, api_messages):",
        "        return {'model': self.model, 'messages': api_messages}",
        "",
      ].join("\n"), "utf8");

      const { stdout } = await execFileAsync(
        "python3",
        [
          "-c",
          [
            "import json",
            "from run_agent import AIAgent",
            "kwargs = AIAgent()._build_api_kwargs([{'role': 'user', 'content': 'ping'}])",
            "print(json.dumps(kwargs, sort_keys=True))",
          ].join("; "),
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PYTHONPATH: root,
            HERMES_ZAI_THINKING: "disabled",
          },
        },
      );

      const parsed = JSON.parse(stdout.trim()) as { extra_body?: { thinking?: { type?: string } } };
      assert.equal(parsed.extra_body?.thinking?.type, "disabled");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves run_agent kwargs untouched when the deploy flag is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-fly-sitecustomize-"));

    try {
      const templatePath = join(process.cwd(), "templates", "sitecustomize.py");
      const sitecustomize = await readFile(templatePath, "utf8");
      await writeFile(join(root, "sitecustomize.py"), sitecustomize, "utf8");
      await writeFile(join(root, "run_agent.py"), [
        "class AIAgent:",
        "    def __init__(self):",
        "        self.provider = 'zai'",
        "        self.base_url = 'https://api.z.ai/api/coding/paas/v4'",
        "        self.model = 'glm-4.7'",
        "",
        "    def _build_api_kwargs(self, api_messages):",
        "        return {'model': self.model, 'messages': api_messages}",
        "",
      ].join("\n"), "utf8");

      const { stdout } = await execFileAsync(
        "python3",
        [
          "-c",
          [
            "import json",
            "from run_agent import AIAgent",
            "kwargs = AIAgent()._build_api_kwargs([{'role': 'user', 'content': 'ping'}])",
            "print(json.dumps(kwargs, sort_keys=True))",
          ].join("; "),
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PYTHONPATH: root,
          },
        },
      );

      const parsed = JSON.parse(stdout.trim()) as { extra_body?: unknown };
      assert.equal(parsed.extra_body, undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
