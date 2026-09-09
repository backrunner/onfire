import { spawnSync } from "node:child_process";

const commands = [
  ["types", "worker-configuration.d.ts", "--env-interface", "CloudflareEnv", "--env-file", "wrangler.types.env"],
  ["types", "workers/email-agent/worker-configuration.d.ts", "-c", "workers/email-agent/wrangler.jsonc", "-c", "wrangler.jsonc", "--env-interface", "MailAgentEnv", "--include-runtime", "false", "--env-file", "wrangler.types.env"],
];
for (const args of commands) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args, ...process.argv.slice(2)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
