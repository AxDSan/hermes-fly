const DEFAULT_TERMINAL_WIDTH = 80;
const MAX_RENDER_WIDTH = 88;
const MIN_RENDER_WIDTH = 48;
const INNER_PADDING = 2;
const HERO_ART = [
  "██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗",
  "██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝",
  "███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗",
  "██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║",
  "██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║",
  "╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝",
  "               _/\\_     F L Y     _/\\_",
  "             _/    \\_           _/    \\_",
  "             \\      /           \\      /",
  "              \\____/             \\____/",
];
const MIN_ENHANCED_WIDTH = Math.max(
  63,
  ...HERO_ART.map((line) => Array.from(line).length),
);

type HeroParams = {
  version: string;
  title: string;
  eyebrow: string;
  subtitle: string;
  width?: number;
};

type PanelParams = {
  title: string;
  lines: string[];
  width?: number;
};

type ChoiceSectionParams = {
  title: string;
  question?: string;
  details?: string[];
  options: string[];
  width?: number;
};

type KeyValuePanelParams = {
  title: string;
  entries: Array<[label: string, value: string]>;
  width?: number;
};

type CopyableSectionParams = {
  title: string;
  question?: string;
  details?: string[];
  lines: string[];
  width?: number;
};

function maxLineLength(lines: string[]): number {
  return lines.reduce((max, line) => Math.max(max, Array.from(line).length), 0);
}

function splitLongToken(word: string, width: number): string[] {
  const chars = Array.from(word);
  const parts: string[] = [];
  for (let index = 0; index < chars.length; index += width) {
    parts.push(chars.slice(index, index + width).join(""));
  }
  return parts.length > 0 ? parts : [word];
}

function resolveTerminalWidth(requestedWidth?: number): number {
  return requestedWidth
    ?? process.stderr.columns
    ?? process.stdout.columns
    ?? DEFAULT_TERMINAL_WIDTH;
}

function renderPlainSection(title: string, lines: string[]): string {
  return [
    title,
    ...lines.map((line) => line.length > 0 ? line : ""),
    "",
  ].join("\n");
}

export function supportsEnhancedDeployScreen(requestedWidth?: number): boolean {
  return resolveTerminalWidth(requestedWidth) >= MIN_ENHANCED_WIDTH;
}

function resolveViewportWidth(requestedWidth?: number): number {
  const terminalWidth = resolveTerminalWidth(requestedWidth);
  return Math.max(MIN_RENDER_WIDTH, Math.min(terminalWidth, MAX_RENDER_WIDTH));
}

function wrapLine(line: string, width: number): string[] {
  if (line.length === 0) {
    return [""];
  }
  if (Array.from(line).length <= width) {
    return [line];
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [line];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (Array.from(word).length > width) {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }

      const parts = splitLongToken(word, width);
      lines.push(...parts.slice(0, -1));
      current = parts.at(-1) ?? "";
      continue;
    }

    if (current.length === 0) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (Array.from(candidate).length <= width) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

function wrapLines(lines: string[], width: number): string[] {
  return lines.flatMap((line) => line.split("\n").flatMap((segment) => wrapLine(segment, width)));
}

function resolvePanelWidth(title: string, lines: string[], requestedWidth?: number): number {
  const viewportWidth = resolveViewportWidth(requestedWidth);
  const contentWidth = Math.max(maxLineLength(lines), Array.from(`◇  ${title} `).length + 4);
  const minimumWidth = Math.min(viewportWidth, Math.max(24, Array.from(`◇  ${title} ╮`).length + 2));
  return Math.max(minimumWidth, Math.min(viewportWidth, contentWidth + 4));
}

export function renderDeployPanel(params: PanelParams): string {
  const width = resolvePanelWidth(params.title, params.lines, params.width);
  const bodyWidth = width - 4;
  const topLabel = `◇  ${params.title} `;
  const top = `${topLabel}${"─".repeat(Math.max(1, width - Array.from(topLabel).length - 1))}╮`;
  const body = wrapLines(params.lines, bodyWidth).map((line) => `│${" ".repeat(INNER_PADDING)}${line.padEnd(bodyWidth)}│`);
  return [
    top,
    `│${" ".repeat(width - 2)}│`,
    ...body,
    `│${" ".repeat(width - 2)}│`,
    `├${"─".repeat(width - 2)}╯`,
    "",
  ].join("\n");
}

export function renderAdaptiveDeployPanel(params: PanelParams): string {
  if (!supportsEnhancedDeployScreen(params.width)) {
    return renderPlainSection(params.title, params.lines);
  }
  return renderDeployPanel(params);
}

export function renderDeployChoiceSection(params: ChoiceSectionParams): string {
  const contentWidth = Math.max(1, resolveViewportWidth(params.width) - 3);
  const bodyLines = [
    ...(params.question ? [params.question] : []),
    ...(params.details ?? []),
    ...(params.question || (params.details?.length ?? 0) > 0 ? [""] : []),
    ...params.options,
  ];

  return [
    `◆  ${params.title}`,
    "│",
    ...bodyLines.flatMap((line) =>
      line.length === 0
        ? ["│"]
        : wrapLine(line, contentWidth).map((wrapped) => `│  ${wrapped}`)
    ),
    "└",
    "",
  ].join("\n");
}

export function renderAdaptiveDeployChoiceSection(params: ChoiceSectionParams): string {
  if (!supportsEnhancedDeployScreen(params.width)) {
    return renderPlainSection(params.title, [
      ...(params.question ? [params.question] : []),
      ...(params.details ?? []),
      ...(params.question || (params.details?.length ?? 0) > 0 ? [""] : []),
      ...params.options,
    ]);
  }
  return renderDeployChoiceSection(params);
}

export function renderDeployCopyableSection(params: CopyableSectionParams): string {
  const contentWidth = Math.max(1, resolveViewportWidth(params.width) - 3);
  const bodyLines = [
    ...(params.question ? [params.question] : []),
    ...(params.details ?? []),
    ...(params.question || (params.details?.length ?? 0) > 0 ? [""] : []),
  ];

  return [
    `◆  ${params.title}`,
    "│",
    ...bodyLines.flatMap((line) =>
      line.length === 0
        ? ["│"]
        : wrapLine(line, contentWidth).map((wrapped) => `│  ${wrapped}`)
    ),
    ...params.lines.map((line) => `│  ${line}`),
    "└",
    "",
  ].join("\n");
}

export function renderAdaptiveDeployCopyableSection(params: CopyableSectionParams): string {
  if (!supportsEnhancedDeployScreen(params.width)) {
    return renderPlainSection(params.title, [
      ...(params.question ? [params.question] : []),
      ...(params.details ?? []),
      ...(params.question || (params.details?.length ?? 0) > 0 ? [""] : []),
      ...params.lines,
    ]);
  }
  return renderDeployCopyableSection(params);
}

export function renderDeployChoiceOptions(
  options: Array<{ label: string; description?: string }>,
  defaultIndex: number
): string[] {
  const labelWidth = options.reduce((max, option) => Math.max(max, option.label.length), 0);
  return options.map((option, index) => {
    const number = String(index + 1).padStart(2, " ");
    const marker = index + 1 === defaultIndex ? "●" : "○";
    const paddedLabel = option.description ? option.label.padEnd(labelWidth) : option.label;
    return option.description
      ? `${number}  ${marker} ${paddedLabel} ${option.description}`
      : `${number}  ${marker} ${paddedLabel}`;
  });
}

export function renderDeployKeyValuePanel(params: KeyValuePanelParams): string {
  const labelWidth = params.entries.reduce((max, [label]) => Math.max(max, label.length + 1), 0);
  const lines = params.entries.map(([label, value]) => `${`${label}:`.padEnd(labelWidth)} ${value}`);
  return renderDeployPanel({
    title: params.title,
    lines,
    width: params.width,
  });
}

export function renderAdaptiveDeployKeyValuePanel(params: KeyValuePanelParams): string {
  if (!supportsEnhancedDeployScreen(params.width)) {
    return renderPlainSection(
      params.title,
      params.entries.map(([label, value]) => `  ${label}: ${value}`)
    );
  }
  return renderDeployKeyValuePanel(params);
}

export function renderDeployHero(params: HeroParams): string {
  return [
    `· ${params.eyebrow}`,
    "",
    `✈ Hermes Fly ${params.version} — guided deploy for Hermes Agent on Fly.io.`,
    "",
    ...HERO_ART,
    "",
    `┌  ${params.title}`,
    "│",
    ...renderDeployPanel({
      title: "Guided setup",
      lines: [params.subtitle],
      width: params.width,
    }).trimEnd().split("\n"),
    "",
  ].join("\n");
}

export function renderAdaptiveDeployHero(params: HeroParams): string {
  if (!supportsEnhancedDeployScreen(params.width)) {
    return [
      "",
      "Hermes Agent Guided Setup",
      "I'll walk you through the deployment setup step by step.",
      "You can press Enter to accept a suggested option whenever one is shown.",
      "",
    ].join("\n");
  }
  return renderDeployHero(params);
}
