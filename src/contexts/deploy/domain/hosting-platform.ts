export type HostingPlatformKey =
  | "fly-io"
  | "deploy-locally"
  | "digitalocean"
  | "exe-dev"
  | "gcp"
  | "hetzner"
  | "northflank"
  | "railway"
  | "render";

export type HostingPlatformAvailability = "available" | "coming_soon";

export interface HostingPlatformOptionInput {
  key: HostingPlatformKey;
  label: string;
  availability: HostingPlatformAvailability;
}

export class HostingPlatformOption {
  readonly key: HostingPlatformKey;
  readonly label: string;
  readonly availability: HostingPlatformAvailability;

  private constructor(input: HostingPlatformOptionInput) {
    this.key = input.key;
    this.label = input.label;
    this.availability = input.availability;
  }

  get disabled(): boolean {
    return this.availability !== "available";
  }

  get displayLabel(): string {
    return this.disabled ? `[SOON] ${this.label}` : this.label;
  }

  static create(input: HostingPlatformOptionInput): HostingPlatformOption {
    const label = input.label.trim();
    if (label.length === 0) {
      throw new Error("HostingPlatformOption.label must be non-empty");
    }

    if (input.availability !== "available" && input.availability !== "coming_soon") {
      throw new Error("HostingPlatformOption.availability must be available|coming_soon");
    }

    return new HostingPlatformOption({
      key: input.key,
      label,
      availability: input.availability,
    });
  }
}

const HOSTING_PLATFORM_CATALOG: ReadonlyArray<HostingPlatformOptionInput> = [
  { key: "fly-io", label: "Fly.io", availability: "available" },
  { key: "deploy-locally", label: "Deploy locally", availability: "coming_soon" },
  { key: "digitalocean", label: "DigitalOcean.com", availability: "coming_soon" },
  { key: "exe-dev", label: "Exe.dev", availability: "coming_soon" },
  { key: "gcp", label: "GCP (Google Cloud)", availability: "coming_soon" },
  { key: "hetzner", label: "Hetzner.com", availability: "coming_soon" },
  { key: "northflank", label: "Northflank.com", availability: "coming_soon" },
  { key: "railway", label: "Railway.com", availability: "coming_soon" },
  { key: "render", label: "Render.com", availability: "coming_soon" },
];

export function listHostingPlatforms(): HostingPlatformOption[] {
  return HOSTING_PLATFORM_CATALOG.map((option) => HostingPlatformOption.create(option));
}

export function resolveDefaultHostingPlatform(): HostingPlatformOption {
  const selected = HOSTING_PLATFORM_CATALOG.find((option) => option.availability === "available");
  if (!selected) {
    throw new Error("HostingPlatform.default must resolve to an available platform");
  }
  return HostingPlatformOption.create(selected);
}
