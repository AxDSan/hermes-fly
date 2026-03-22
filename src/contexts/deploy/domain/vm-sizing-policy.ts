export type VmSizingReason = "messaging-gateway";
export type VmSizingAdvisory = "messaging-minimum";

export interface VmSizingInput {
  currentVmSize: string;
  messagingPlatforms?: string[];
}

export interface VmSizingDecision {
  vmSize: string;
  adjusted: boolean;
  reason?: VmSizingReason;
  advisory?: VmSizingAdvisory;
}

const VM_SIZE_ORDER = [
  "shared-cpu-1x",
  "shared-cpu-2x",
  "performance-1x",
  "performance-2x",
];

const MINIMUM_VM_SIZE_FOR_MESSAGING = "shared-cpu-2x";

export class VmSizingPolicy {
  static resolve(input: VmSizingInput): VmSizingDecision {
    const minimum = this.minimumVmSize(input);
    if (this.meetsMinimum(input.currentVmSize, minimum.vmSize)) {
      return {
        vmSize: input.currentVmSize,
        adjusted: false,
        ...(minimum.reason === "messaging-gateway" && input.currentVmSize === minimum.vmSize
          ? { advisory: "messaging-minimum" as const }
          : {}),
      };
    }

    return {
      vmSize: minimum.vmSize,
      adjusted: true,
      reason: minimum.reason,
    };
  }

  private static minimumVmSize(input: VmSizingInput): { vmSize: string; reason?: VmSizingReason } {
    const messagingPlatforms = input.messagingPlatforms ?? [];
    if (messagingPlatforms.length > 0) {
      return {
        vmSize: MINIMUM_VM_SIZE_FOR_MESSAGING,
        reason: "messaging-gateway",
      };
    }

    return { vmSize: "shared-cpu-1x" };
  }

  private static meetsMinimum(currentVmSize: string, minimumVmSize: string): boolean {
    const currentIndex = VM_SIZE_ORDER.indexOf(currentVmSize);
    const minimumIndex = VM_SIZE_ORDER.indexOf(minimumVmSize);
    if (currentIndex === -1 || minimumIndex === -1) {
      return currentVmSize === minimumVmSize;
    }
    return currentIndex >= minimumIndex;
  }
}
