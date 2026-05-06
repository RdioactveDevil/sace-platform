/**
 * Cross-platform replacement for the previous `sh`-based preinstall hook
 * (Windows does not ship `sh` in PATH by default).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

for (const name of ["package-lock.json", "yarn.lock"]) {
  const file = path.join(root, name);
  try {
    fs.unlinkSync(file);
  } catch {
    // ignore missing / unreadable
  }
}

const ua = process.env.npm_config_user_agent || "";
if (!ua.includes("pnpm/")) {
  console.error("Use pnpm instead of npm or yarn for this repository.");
  process.exit(1);
}
