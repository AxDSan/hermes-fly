import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  renderAdaptiveDeployChoiceSection,
  renderAdaptiveDeployCopyableSection,
  renderAdaptiveDeployPanel,
  renderDeployCopyableSection,
  renderDeployChoiceOptions,
  renderDeployChoiceSection,
  renderDeployHero,
  renderDeployKeyValuePanel,
  renderDeployPanel,
  supportsEnhancedDeployScreen,
} from "../../src/contexts/deploy/application/presentation/deploy-screen.ts";

function withMockedTerminalWidth(width: number, fn: () => void) {
  const stream = process.stderr as NodeJS.WriteStream & { columns?: number };
  const hadOwn = Object.prototype.hasOwnProperty.call(stream, "columns");
  const previous = stream.columns;
  Object.defineProperty(stream, "columns", {
    value: width,
    configurable: true,
  });
  try {
    fn();
  } finally {
    if (hadOwn) {
      Object.defineProperty(stream, "columns", {
        value: previous,
        configurable: true,
      });
    } else {
      delete stream.columns;
    }
  }
}

function maxRenderedWidth(rendered: string): number {
  return rendered
    .trimEnd()
    .split("\n")
    .reduce((max, line) => Math.max(max, Array.from(line).length), 0);
}

describe("deploy-screen", () => {
  it("renders an OpenClaw-inspired deploy hero", () => {
    const rendered = renderDeployHero({
      version: "0.1.95",
      title: "Hermes Fly deploy",
      eyebrow: "Starting deploy",
      subtitle: "Deploy Hermes Agent to Fly.io with a guided setup flow.",
    });

    assert.match(rendered, /Starting deploy/);
    assert.match(rendered, /Hermes Fly 0\.1\.95/);
    assert.match(rendered, /HERMES/);
    assert.match(rendered, /Guided setup/);
    assert.match(rendered, /guided setup flow/i);
  });

  it("renders boxed note panels", () => {
    const rendered = renderDeployPanel({
      title: "Deployment name",
      lines: [
        "Each deployment needs a unique name on Fly.io.",
        "Suggested: hermes-test-app",
      ],
    });

    assert.match(rendered, /◇  Deployment name/);
    assert.match(rendered, /Each deployment needs a unique name on Fly\.io\./);
    assert.match(rendered, /Suggested: hermes-test-app/);
    assert.match(rendered, /╮/);
    assert.match(rendered, /╯/);
  });

  it("renders choice sections with radio-style markers", () => {
    const rendered = renderDeployChoiceSection({
      title: "AI access",
      question: "How should Hermes access AI models?",
      options: renderDeployChoiceOptions([
        { label: "OpenRouter API key", description: "Bring your own API key" },
        { label: "ChatGPT subscription", description: "Sign in with OpenAI Codex" },
      ], 1),
    });

    assert.match(rendered, /◆  AI access/);
    assert.match(rendered, /How should Hermes access AI models\?/);
    assert.match(rendered, /1  ● OpenRouter API key/);
    assert.match(rendered, /2  ○ ChatGPT subscription/);
  });

  it("uses the actual default selection when rendering radio options", () => {
    const rendered = renderDeployChoiceSection({
      title: "Messaging",
      question: "Which messaging platforms do you want to connect now?",
      options: renderDeployChoiceOptions([
        { label: "Telegram", description: "Chat with your agent in Telegram" },
        { label: "Discord", description: "Chat with your agent in Discord" },
        { label: "Slack", description: "Chat with your agent in Slack" },
        { label: "WhatsApp", description: "Chat with your agent in WhatsApp" },
        { label: "Skip for now" },
      ], 5),
    });

    assert.match(rendered, /1  ○ Telegram/);
    assert.match(rendered, /5  ● Skip for now/);
  });

  it("renders boxed key-value summaries", () => {
    const rendered = renderDeployKeyValuePanel({
      title: "Deployment summary",
      entries: [
        ["Fly organization", "personal"],
        ["Deployment name", "test-app"],
        ["Release channel", "stable"],
      ],
    });

    assert.match(rendered, /Deployment summary/);
    assert.match(rendered, /Fly organization:\s+personal/);
    assert.match(rendered, /Deployment name:\s+test-app/);
    assert.match(rendered, /Release channel:\s+stable/);
  });

  it("caps boxed panels to the current terminal width", () => {
    withMockedTerminalWidth(72, () => {
      const rendered = renderDeployPanel({
        title: "Guided setup",
        lines: [
          "I'll walk you through the deployment setup step by step. Press Enter to accept a suggested option whenever one is shown.",
        ],
      });

      assert.ok(maxRenderedWidth(rendered) <= 72, rendered);
    });
  });

  it("disables the enhanced deploy screens on narrow terminals", () => {
    withMockedTerminalWidth(60, () => {
      assert.equal(supportsEnhancedDeployScreen(), false);
    });

    withMockedTerminalWidth(80, () => {
      assert.equal(supportsEnhancedDeployScreen(), true);
    });
  });

  it("preserves copyable commands and links without injecting wraps", () => {
    const longAppName = `hermes-${"a".repeat(56)}`;
    const longTelegramUsername = `hermes${"bot".repeat(8)}`;
    const rendered = renderDeployCopyableSection({
      title: "Next steps",
      question: "Copy these values directly:",
      lines: [
        `Chat link: https://t.me/${longTelegramUsername}?start=${longAppName}`,
        `hermes-fly status -a ${longAppName}`,
      ],
    });

    assert.ok(rendered.includes(`https://t.me/${longTelegramUsername}?start=${longAppName}`), rendered);
    assert.ok(rendered.includes(`hermes-fly status -a ${longAppName}`), rendered);
  });

  it("falls back to a plain section below the enhanced-width threshold", () => {
    const rendered = renderAdaptiveDeployPanel({
      title: "OpenAI Codex sign-in",
      lines: [
        "Open this URL in your browser.",
        "Enter the one-time code.",
      ],
      width: 60,
    });

    assert.match(rendered, /^OpenAI Codex sign-in$/m);
    assert.match(rendered, /Open this URL in your browser\./);
    assert.doesNotMatch(rendered, /◇  OpenAI Codex sign-in/);
  });

  it("renders enhanced choice sections when the terminal is wide enough", () => {
    const rendered = renderAdaptiveDeployChoiceSection({
      title: "OpenAI Codex login",
      question: "Reuse the saved login or start a fresh sign-in?",
      options: renderDeployChoiceOptions([
        { label: "Reuse it", description: "Use the saved ChatGPT subscription login" },
        { label: "Sign in again", description: "Start a fresh OpenAI Codex login now" },
      ], 1),
      width: 80,
    });

    assert.match(rendered, /◆  OpenAI Codex login/);
    assert.match(rendered, /1  ● Reuse it/);
    assert.match(rendered, /2  ○ Sign in again/);
  });

  it("keeps adaptive copyable sections copy-safe in enhanced mode", () => {
    const rendered = renderAdaptiveDeployCopyableSection({
      title: "OpenAI Codex sign-in",
      question: "Use these values exactly:",
      lines: [
        "https://auth.openai.com/codex/device",
        "ABCD-EFGH",
      ],
      width: 80,
    });

    assert.match(rendered, /◆  OpenAI Codex sign-in/);
    assert.ok(rendered.includes("https://auth.openai.com/codex/device"), rendered);
    assert.ok(rendered.includes("ABCD-EFGH"), rendered);
  });
});
