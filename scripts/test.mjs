import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const runIndex = args.indexOf("--run");
const runTarget = runIndex === -1 ? null : args[runIndex + 1];
const databaseOnly = runTarget === "database";

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (runTarget && runTarget !== "database") {
  console.error(`Unsupported --run target: ${runTarget}`);
  process.exit(1);
}

run("node", ["scripts/verify-scaffold.mjs"]);
run("node", ["scripts/validate-database.mjs"]);

if (!databaseOnly) {
  run("npm", ["run", "test", "--workspaces", "--if-present"]);
}
