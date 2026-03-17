import type { ProcessRunner } from "../../../../adapters/process.js";

const DEFAULT_ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const DEFAULT_ZAI_GENERAL_BASE_URL = "https://api.z.ai/api/paas/v4";

const ZAI_ENDPOINTS = [
  {
    id: "coding-global",
    baseUrl: DEFAULT_ZAI_CODING_BASE_URL,
    defaultModel: "glm-4.7",
    label: "Global (Coding Plan)",
  },
  {
    id: "coding-cn",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    defaultModel: "glm-4.7",
    label: "China (Coding Plan)",
  },
  {
    id: "global",
    baseUrl: DEFAULT_ZAI_GENERAL_BASE_URL,
    defaultModel: "glm-5",
    label: "Global",
  },
  {
    id: "cn",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5",
    label: "China",
  },
] as const;

const DEFAULT_ZAI_MODELS = [
  "glm-5",
  "glm-4.7",
  "glm-4.5",
  "glm-4.5-flash",
] as const;

export interface ZaiEndpointResolution {
  id: string;
  baseUrl: string;
  defaultModel: string;
  label: string;
}

export interface ZaiModelOption {
  value: string;
  label: string;
  bestFor: string;
  providerKey: string;
  providerLabel: string;
  supportsReasoning: boolean;
}

export class ZaiApiKeyAdapter {
  constructor(
    private readonly process: ProcessRunner,
    private readonly env: NodeJS.ProcessEnv = globalThis.process.env
  ) {}

  resolvePresetApiKey(): string | null {
    const candidates = [
      this.env.GLM_API_KEY,
      this.env.ZAI_API_KEY,
      this.env.Z_AI_API_KEY,
    ];
    for (const candidate of candidates) {
      const value = String(candidate ?? "").trim();
      if (value.length > 0) {
        return value;
      }
    }
    return null;
  }

  resolvePresetBaseUrl(): string | null {
    const value = String(this.env.GLM_BASE_URL ?? "").trim();
    return value.length > 0 ? value : null;
  }

  async detectEndpoint(apiKey: string): Promise<ZaiEndpointResolution | null> {
    for (const endpoint of ZAI_ENDPOINTS) {
      const result = await this.process.run(
        "curl",
        [
          "-sS",
          "--max-time",
          "8",
          "-o",
          "-",
          "-w",
          "\n%{http_code}",
          "-X",
          "POST",
          `${endpoint.baseUrl}/chat/completions`,
          "-H",
          `Authorization: Bearer ${apiKey}`,
          "-H",
          "Content-Type: application/json",
          "-d",
          JSON.stringify({
            model: endpoint.defaultModel,
            stream: false,
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
        ],
        { env: this.env }
      );

      if (result.exitCode !== 0) {
        continue;
      }

      const statusCode = readStatusCode(result.stdout);
      if (statusCode === 200) {
        return { ...endpoint };
      }
    }

    return null;
  }

  staticModelOptions(preferredModel?: string): ZaiModelOption[] {
    const preferred = (preferredModel ?? "").trim();
    const ordered = [...DEFAULT_ZAI_MODELS].sort((left, right) => {
      if (left === preferred) {
        return -1;
      }
      if (right === preferred) {
        return 1;
      }
      return 0;
    });

    return ordered.map((modelId) => this.buildModelOption(modelId));
  }

  codingFallback(): ZaiEndpointResolution {
    return { ...ZAI_ENDPOINTS[0] };
  }

  private buildModelOption(modelId: string): ZaiModelOption {
    return {
      value: modelId,
      label: humanizeModel(modelId),
      bestFor: describeModel(modelId),
      providerKey: "zai",
      providerLabel: "Z.AI",
      supportsReasoning: false,
    };
  }
}

function readStatusCode(stdout: string): number | null {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/);
  const status = Number(lines[lines.length - 1]);
  return Number.isFinite(status) ? status : null;
}

function humanizeModel(modelId: string): string {
  return modelId
    .split("-")
    .map((part) => (/^\d/.test(part) ? part : part.toUpperCase()))
    .join(" ");
}

function describeModel(modelId: string): string {
  if (modelId === "glm-4.7") {
    return "Recommended for Coding Plan";
  }
  if (modelId === "glm-5") {
    return "Higher capability";
  }
  if (modelId.includes("flash")) {
    return "Fast / lower cost";
  }
  return "Z.AI model";
}
