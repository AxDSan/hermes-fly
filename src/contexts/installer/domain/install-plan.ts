export type InstallChannel = "latest" | "stable" | "preview" | "edge";
export type InstallMethod = "release_asset" | "source_build";

export interface InstallerPlanInput {
  platform: string;
  arch: string;
  installChannel: InstallChannel;
  installMethod: InstallMethod;
  installRef: string;
  installHome: string;
  binDir: string;
  sourceDir: string;
}

const INSTALL_CHANNELS = new Set<InstallChannel>(["latest", "stable", "preview", "edge"]);
const INSTALL_METHODS = new Set<InstallMethod>(["release_asset", "source_build"]);

function requireTrimmedNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} must be non-empty`);
  }
  return trimmed;
}

export class InstallerPlan {
  readonly platform: string;
  readonly arch: string;
  readonly installChannel: InstallChannel;
  readonly installMethod: InstallMethod;
  readonly installRef: string;
  readonly installHome: string;
  readonly binDir: string;
  readonly sourceDir: string;

  private constructor(input: InstallerPlanInput) {
    this.platform = input.platform;
    this.arch = input.arch;
    this.installChannel = input.installChannel;
    this.installMethod = input.installMethod;
    this.installRef = input.installRef;
    this.installHome = input.installHome;
    this.binDir = input.binDir;
    this.sourceDir = input.sourceDir;
  }

  static create(input: InstallerPlanInput): InstallerPlan {
    const platform = requireTrimmedNonEmpty(input.platform, "InstallerPlan.platform");
    const arch = requireTrimmedNonEmpty(input.arch, "InstallerPlan.arch");
    const installRef = requireTrimmedNonEmpty(input.installRef, "InstallerPlan.installRef");
    const installHome = requireTrimmedNonEmpty(input.installHome, "InstallerPlan.installHome");
    const binDir = requireTrimmedNonEmpty(input.binDir, "InstallerPlan.binDir");
    const sourceDir = requireTrimmedNonEmpty(input.sourceDir, "InstallerPlan.sourceDir");

    if (!INSTALL_CHANNELS.has(input.installChannel)) {
      throw new Error("InstallerPlan.installChannel must be one of latest|stable|preview|edge");
    }
    if (!INSTALL_METHODS.has(input.installMethod)) {
      throw new Error("InstallerPlan.installMethod must be release_asset|source_build");
    }

    return new InstallerPlan({
      platform,
      arch,
      installChannel: input.installChannel,
      installMethod: input.installMethod,
      installRef,
      installHome,
      binDir,
      sourceDir,
    });
  }
}
