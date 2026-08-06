const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function rebuildElectronNative(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const appOutDir = context.appOutDir;
  const betterSqliteDir = path.join(
    appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3"
  );

  if (!fs.existsSync(betterSqliteDir)) {
    return;
  }

  const sourceBinding = path.join(projectDir, "node_modules", "better-sqlite3", "binding.gyp");
  const targetBinding = path.join(betterSqliteDir, "binding.gyp");
  if (fs.existsSync(sourceBinding) && !fs.existsSync(targetBinding)) {
    fs.copyFileSync(sourceBinding, targetBinding);
  }

  const nodeGyp = path.join(projectDir, "node_modules", "node-gyp", "bin", "node-gyp.js");
  const electronVersion = require(path.join(projectDir, "node_modules", "electron", "package.json")).version;
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "",
    npm_config_runtime: "electron",
    npm_config_target: electronVersion,
    npm_config_disturl: "https://electronjs.org/headers",
    npm_config_build_from_source: "true",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  execFileSync(process.execPath, [
    nodeGyp,
    "rebuild",
    `--target=${electronVersion}`,
    "--arch=x64",
    "--dist-url=https://electronjs.org/headers",
    "--runtime=electron",
  ], {
    cwd: betterSqliteDir,
    env,
    stdio: "inherit",
  });
};
