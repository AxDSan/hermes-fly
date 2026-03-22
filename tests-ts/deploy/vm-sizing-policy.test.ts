import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VmSizingPolicy } from "../../src/contexts/deploy/domain/vm-sizing-policy.ts";

describe("VmSizingPolicy", () => {
  it("keeps Starter for lightweight deployments without messaging gateways", () => {
    const result = VmSizingPolicy.resolve({
      currentVmSize: "shared-cpu-1x",
      messagingPlatforms: [],
    });

    assert.deepEqual(result, {
      vmSize: "shared-cpu-1x",
      adjusted: false,
    });
  });

  it("promotes Starter to Standard when a messaging gateway is enabled", () => {
    const result = VmSizingPolicy.resolve({
      currentVmSize: "shared-cpu-1x",
      messagingPlatforms: ["telegram"],
    });

    assert.deepEqual(result, {
      vmSize: "shared-cpu-2x",
      adjusted: true,
      reason: "messaging-gateway",
    });
  });

  it("leaves larger machines unchanged when messaging gateways are enabled", () => {
    const result = VmSizingPolicy.resolve({
      currentVmSize: "performance-1x",
      messagingPlatforms: ["telegram", "discord"],
    });

    assert.deepEqual(result, {
      vmSize: "performance-1x",
      adjusted: false,
    });
  });

  it("keeps Standard but marks it as the minimum recommended size for messaging gateways", () => {
    const result = VmSizingPolicy.resolve({
      currentVmSize: "shared-cpu-2x",
      messagingPlatforms: ["whatsapp"],
    });

    assert.deepEqual(result, {
      vmSize: "shared-cpu-2x",
      adjusted: false,
      advisory: "messaging-minimum",
    });
  });
});
