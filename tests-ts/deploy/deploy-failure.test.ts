import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DeployFailurePolicy } from "../../src/contexts/deploy/domain/deploy-failure.ts";

describe("DeployFailurePolicy", () => {
  it("classifies Fly capacity failures and suggests a larger server size", () => {
    const failure = DeployFailurePolicy.classify({
      rawOutput: `
        -------
         ✖ Failed: error creating a new machine: failed to launch VM: aborted: insufficient resources available to fulfill request
        -------
        Error: error creating a new machine: failed to launch VM: aborted: insufficient resources available to fulfill request: could not reserve resource for machine: insufficient memory available to fulfill request
      `,
      vmSize: "shared-cpu-2x",
    });

    assert.deepEqual(failure, {
      kind: "capacity",
      summary: "Fly.io could not find room for a new server in that region right now.",
      detail: "insufficient memory available to fulfill request",
      suggestedVmSize: "performance-1x",
    });
  });

  it("falls back to a generic deploy failure when Fly output does not match a known pattern", () => {
    const failure = DeployFailurePolicy.classify({
      rawOutput: "Error: fly deploy exited with code 1",
      vmSize: "shared-cpu-2x",
    });

    assert.deepEqual(failure, {
      kind: "generic",
      summary: "Fly.io stopped the deploy before Hermes could finish setup.",
      detail: "fly deploy exited with code 1",
    });
  });
});
