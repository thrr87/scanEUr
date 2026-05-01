import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "astro.cmd" : "astro";
const child = spawn(command, process.argv.slice(2), {
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: "1"
  },
  stdio: "inherit",
  shell: false
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("close", (status) => {
  process.exitCode = status ?? 1;
});
