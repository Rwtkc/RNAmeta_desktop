const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
const cargoConfigPath = path.join(projectRoot, "src-tauri", "Cargo.toml");
const releaseDir = path.join(projectRoot, "src-tauri", "target", "release");
const releaseResourcesDir = path.join(releaseDir, "resources");
const viennaRnaSourceDir = path.join(projectRoot, "external", "viennarna");
const outputRoot = path.join(projectRoot, "portable-dist");
const tauriCliEntrypoint = require.resolve("@tauri-apps/cli/tauri.js", {
  paths: [projectRoot]
});

function runStep(command, args, label) {
  console.log(`[build-portable] ${label}...`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNodeScript(relativePath, label) {
  runStep(process.execPath, [path.join(projectRoot, relativePath)], label);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCargoPackageName(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Unable to resolve Cargo package name from ${filePath}`);
  }
  return match[1];
}

function cleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    dereference: false,
    preserveTimestamps: true
  });
}

function copyOptionalDlls(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".dll") {
      continue;
    }
    fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
  }
}

function sanitizePortableName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "app";
}

function findReleaseExecutable(releaseRoot, preferredNames) {
  for (const name of preferredNames) {
    const fullPath = path.join(releaseRoot, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  const candidates = fs
    .readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".exe")
    .map((entry) => path.join(releaseRoot, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`No release executable found under ${releaseRoot}`);
  }

  return candidates[0];
}

const tauriConfig = readJson(tauriConfigPath);
const cargoPackageName = readCargoPackageName(cargoConfigPath);
const productName = sanitizePortableName(tauriConfig.productName || cargoPackageName);
const portableDir = path.join(outputRoot, `${productName}-portable`);
const portableExeName = `${productName}.exe`;
const shouldBuild = process.env.SKIP_TAURI_BUILD !== "1";

runNodeScript("scripts/sync-r-runtime.cjs", "Syncing embedded R runtime");
runNodeScript("scripts/clean-tauri-scripts.cjs", "Removing unpacked script resources");

if (shouldBuild) {
  runStep(
    process.execPath,
    [tauriCliEntrypoint, "build", "--no-bundle"],
    "Building no-bundle desktop executable"
  );
} else {
  console.log("[build-portable] Reusing existing release build.");
}

if (!fs.existsSync(releaseResourcesDir)) {
  throw new Error(`Release resources directory not found: ${releaseResourcesDir}`);
}
if (!fs.existsSync(path.join(viennaRnaSourceDir, "RNAfold.exe"))) {
  throw new Error(`Bundled RNAfold executable not found: ${viennaRnaSourceDir}`);
}

const releaseExe = findReleaseExecutable(releaseDir, [
  `${productName}.exe`,
  `${cargoPackageName}.exe`
]);

cleanDir(portableDir);
fs.copyFileSync(releaseExe, path.join(portableDir, portableExeName));
copyOptionalDlls(releaseDir, portableDir);
copyDir(releaseResourcesDir, path.join(portableDir, "resources"));
copyDir(
  viennaRnaSourceDir,
  path.join(portableDir, "resources", "external", "viennarna")
);

console.log(`[build-portable] Portable package ready: ${portableDir}`);
