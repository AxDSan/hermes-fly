import assert from "node:assert/strict";
import test from "node:test";
import { buildInstallerProgram, runInstaller, type InstallCommandInput } from "../../src/install-cli";

test("installer CLI registers the internal install command", () => {
  const program = buildInstallerProgram(async () => 0);
  const names = program.commands.map((command) => command.name());
  assert.deepEqual(names, ["install"]);
});

test("installer CLI parses install arguments into an install command request", async () => {
  const calls: InstallCommandInput[] = [];
  const program = buildInstallerProgram(async (plan) => {
    calls.push(plan);
    return 0;
  });

  await program.parseAsync(
    [
      "install",
      "--platform",
      "darwin",
      "--arch",
      "arm64",
      "--channel",
      "latest",
      "--method",
      "release_asset",
      "--ref",
      "v0.1.96",
      "--install-home",
      "/usr/local/lib/hermes-fly",
      "--bin-dir",
      "/usr/local/bin",
      "--source-dir",
      "/tmp/hermes-fly",
    ],
    { from: "user" },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.platform, "darwin");
  assert.equal(calls[0]?.installMethod, "release_asset");
  assert.equal(calls[0]?.sourceDir, "/tmp/hermes-fly");
});

test("installer CLI runs install when invoked with no explicit subcommand", async () => {
  const calls: InstallCommandInput[] = [];
  const program = buildInstallerProgram(async (plan) => {
    calls.push(plan);
    return 0;
  });

  await runInstaller(["node", "dist/install-cli.js"], program);

  assert.equal(calls.length, 1);
});

test("installer CLI treats flag-only invocations as install", async () => {
  const calls: InstallCommandInput[] = [];
  const program = buildInstallerProgram(async (plan) => {
    calls.push(plan);
    return 0;
  });

  await runInstaller(
    ["node", "dist/install-cli.js", "--channel", "edge", "--install-home", "/tmp/hermes-fly"],
    program,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.installChannel, "edge");
  assert.equal(calls[0]?.installHome, "/tmp/hermes-fly");
});

test("installer CLI preserves unknown-command failures for stray bare arguments", async () => {
  const calls: InstallCommandInput[] = [];
  const program = buildInstallerProgram(async (plan) => {
    calls.push(plan);
    return 0;
  });
  program.exitOverride();

  await assert.rejects(
    async () => await runInstaller(["node", "dist/install-cli.js", "typo"], program),
    /unknown command 'typo'/,
  );

  assert.equal(calls.length, 0);
});
