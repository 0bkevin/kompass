import { platformReadiness } from "../server/platform-readiness.mjs";
import { localMediaCapabilities } from "./media-worker.mjs";
const args = process.argv.slice(2);
if (args.some((arg) => !["--require-ai", "--require-media"].includes(arg))) {
  console.error(
    "Usage: npm run integrations:check -- [--require-ai] [--require-media]",
  );
  process.exitCode = 2;
} else {
  const report = platformReadiness();
  if (args.includes("--require-media")) {
    report.media.runtime = localMediaCapabilities({ refresh: true });
    report.media.verification = "runtime-prerequisites-only";
    report.media.runtimeVerificationRequired = false;
    report.media.liveGenerationVerified = false;
  }
  console.log(JSON.stringify(report, null, 2));
  if (
    !report.coreReady ||
    (args.includes("--require-ai") && !report.ai.ready) ||
    (args.includes("--require-media") &&
      (!report.media.runtime.image.ready || !report.media.runtime.video.ready))
  )
    process.exitCode = 1;
}
