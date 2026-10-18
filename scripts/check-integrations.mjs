import { platformReadiness } from "../server/platform-readiness.mjs";
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--require-ai")) {
  console.error("Usage: npm run integrations:check -- [--require-ai]");
  process.exitCode = 2;
} else {
  const report = platformReadiness();
  console.log(JSON.stringify(report, null, 2));
  if (!report.coreReady || (args.includes("--require-ai") && !report.ai.ready))
    process.exitCode = 1;
}
