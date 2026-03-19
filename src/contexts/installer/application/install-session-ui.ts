export interface InstallerUiWriteTarget {
  write(chunk: string): void;
  isTTY?: boolean;
}

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  accent: "\u001b[38;2;255;77;77m",
  info: "\u001b[38;2;136;146;176m",
  success: "\u001b[38;2;0;229;204m",
  warn: "\u001b[38;2;255;176;32m",
  muted: "\u001b[38;2;90;100;128m",
} as const;

function noColorRequested(env: NodeJS.ProcessEnv): boolean {
  return Object.prototype.hasOwnProperty.call(env, "NO_COLOR");
}

function supportsColor(target: InstallerUiWriteTarget, env: NodeJS.ProcessEnv): boolean {
  if (noColorRequested(env)) {
    return false;
  }
  if ((env.TERM ?? "dumb") === "dumb") {
    return false;
  }
  return target.isTTY === true;
}

export class InstallSessionUi {
  private readonly colorEnabled: boolean;

  constructor(
    private readonly output: InstallerUiWriteTarget,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.colorEnabled = supportsColor(output, env);
  }

  banner(): void {
    this.output.write(`  ${this.style("🪽 Hermes Fly Installer", ANSI.accent, true)}\n`);
    this.output.write(`  ${this.style("I can't fix Fly.io billing, but I can fix the part between curl and deploy.", ANSI.info)}\n\n`);
  }

  heading(title: string): void {
    this.output.write(`${this.style(title, ANSI.accent, true)}\n`);
  }

  stage(current: number, total: number, title: string): void {
    this.heading(`[${current}/${total}] ${title}`);
  }

  keyValue(key: string, value: string): void {
    this.output.write(`${this.style(`${key}:`, ANSI.muted)} ${value}\n`);
  }

  success(message: string): void {
    this.symbolLine("✓", ANSI.success, false, message);
  }

  info(message: string): void {
    this.symbolLine("·", ANSI.muted, false, message);
  }

  warn(message: string): void {
    this.symbolLine("!", ANSI.warn, false, message);
  }

  celebrate(message: string): void {
    this.output.write(`${this.style(message, ANSI.success, true)}\n`);
  }

  muted(message: string): void {
    this.output.write(`${this.style(message, ANSI.muted)}\n`);
  }

  plain(message: string): void {
    this.output.write(`${message}\n`);
  }

  blankLine(): void {
    this.output.write("\n");
  }

  private symbolLine(symbol: string, color: string, bold: boolean, message: string): void {
    this.output.write(`${this.style(symbol, color, bold)} ${message}\n`);
  }

  private style(text: string, color: string, bold = false): string {
    if (!this.colorEnabled) {
      return text;
    }

    const prefix = bold ? `${color}${ANSI.bold}` : color;
    return `${prefix}${text}${ANSI.reset}`;
  }
}
