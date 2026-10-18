import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2] && path.resolve(process.argv[2]);
if (
  !output ||
  process.argv.length !== 3 ||
  output === root ||
  output.startsWith(root + path.sep)
)
  throw new Error(
    "Usage: node scripts/package-release.mjs /absolute/new-directory-outside-checkout",
  );

// Explicit runtime inputs: never copy .env, credentials, DATA_DIR or the worktree.
const inputs = [
  "package.json",
  "package-lock.json",
  "server",
  "scripts",
  "src/lib",
  "dist",
];
await fs.access(path.join(root, "dist/server/server.js"));
await fs.mkdir(output, { recursive: false, mode: 0o755 });
for (const name of inputs) {
  await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
  await fs.cp(path.join(root, name), path.join(output, name), {
    recursive: true,
  });
}
const files = {};
async function inventory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.isFile())
      files[path.relative(output, file)] = createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex");
    else
      throw new Error("Release inputs must be regular files and directories.");
  }
}
await inventory(output);
const manifest = {
  source_git_head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  source_dirty: !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  created_at: new Date().toISOString(),
  files,
  secrets_included: false,
  existing_user_data_included: false,
};
await fs.writeFile(
  path.join(output, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    output,
    source: manifest.source_git_head,
    sourceDirty: manifest.source_dirty,
    files: Object.keys(files).length,
  }),
);
