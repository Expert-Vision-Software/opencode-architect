import { describe, expect, test } from "bun:test";
import path from "node:path";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_ROOT, "cli.ts");

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<CliRun> {
  const proc = Bun.spawn([process.execPath, CLI_PATH, ...args], {
    cwd: PACKAGE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe("cli", () => {
  test("no arguments prints help and exits 0", async () => {
    const run = await runCli([]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("install");
    expect(run.stdout).toContain("uninstall");
    expect(run.stdout).toContain("status");
  });

  test("--version prints the package version and exits 0", async () => {
    const packageJson = JSON.parse(
      await Bun.file(path.join(PACKAGE_ROOT, "package.json")).text(),
    ) as { version: string };

    const run = await runCli(["--version"]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain(packageJson.version);
  });

  test("unknown command exits 1", async () => {
    const run = await runCli(["bogus"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Unknown command");
  });
});
