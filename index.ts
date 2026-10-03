export { OpencodeArchitectPlugin, default } from "./plugin.ts";

if (import.meta.main) {
  const { runCli } = await import("./src/cli.ts");
  process.exitCode = await runCli(process.argv.slice(2));
}
