#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const root = process.cwd();
const scratchDir = join(root, "scratch");
const handoffFile = join(scratchDir, "agent-handoff.md");
const logFile = join(scratchDir, "agent-collab.log");

const args = process.argv.slice(2);
const command = args[0] || "status";

function run(bin, binArgs, options = {}) {
  try {
    return execFileSync(bin, binArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    const message = error.stderr || error.stdout || error.message;
    return `[error] ${String(message).trim()}`;
  }
}

function option(name, fallback = "") {
  const full = `--${name}`;
  const index = args.indexOf(full);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function ensureScratch() {
  if (!existsSync(scratchDir)) mkdirSync(scratchDir, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function gitBranch() {
  return run("git", ["branch", "--show-current"]) || "(detached)";
}

function gitStatusLines() {
  const output = run("git", ["status", "--short"]);
  if (!output || output.startsWith("[error]")) return [];
  return output.split(/\r?\n/).filter(Boolean);
}

function changedFiles() {
  return gitStatusLines().map((line) => {
    const status = line.slice(0, 2).trim() || "M";
    const file = line.slice(2).trim();
    return { status, file };
  });
}

function packageJson() {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

function detectAreas(files) {
  const areas = new Set();
  for (const { file } of files) {
    const normalized = file.replaceAll("\\", "/");
    if (normalized.startsWith("apps/backend/")) areas.add("backend");
    if (normalized.startsWith("apps/tpv/")) areas.add("tpv");
    if (normalized.startsWith("apps/admin/")) areas.add("admin");
    if (normalized.startsWith("apps/saas/")) areas.add("saas");
    if (normalized.startsWith("apps/kds/")) areas.add("kds");
    if (normalized.startsWith("apps/kiosk/")) areas.add("kiosk");
    if (normalized.startsWith("apps/delivery/")) areas.add("delivery");
    if (normalized.startsWith("apps/client/")) areas.add("client");
    if (normalized.startsWith("packages/database/")) areas.add("database");
    if (normalized.startsWith("packages/types/")) areas.add("types");
    if (normalized.startsWith("tests/e2e/")) areas.add("e2e");
    if (normalized.endsWith(".prisma") || normalized.includes("/prisma/")) areas.add("database");
  }
  return [...areas].sort();
}

function recommendedChecks(areas) {
  const checks = new Set();
  checks.add("pnpm run build");

  if (areas.includes("backend")) {
    checks.add("pnpm --filter @mrtpvrest/backend test");
  }

  if (areas.includes("tpv")) {
    checks.add("pnpm --filter @mrtpvrest/tpv test");
    checks.add("pnpm --filter @mrtpvrest/tpv build");
  }

  if (areas.includes("admin")) {
    checks.add("pnpm --filter @mrtpvrest/admin build");
  }

  if (areas.includes("database")) {
    checks.add("pnpm run db:generate");
  }

  if (areas.includes("e2e")) {
    checks.add("pnpm run test:e2e");
  }

  return [...checks];
}

function recentCommits() {
  const output = run("git", ["log", "--oneline", "-5"]);
  if (!output || output.startsWith("[error]")) return [];
  return output.split(/\r?\n/).filter(Boolean);
}

function printStatus() {
  const files = changedFiles();
  const areas = detectAreas(files);
  const pkg = packageJson();

  console.log("Estado de colaboracion entre agentes");
  console.log("=====================================");
  console.log(`Repo: ${root}`);
  console.log(`Branch: ${gitBranch()}`);
  console.log(`Package manager: ${pkg.packageManager || "unknown"}`);
  console.log("");

  console.log("Archivos con cambios:");
  if (files.length === 0) {
    console.log("- Working tree limpio");
  } else {
    for (const item of files) console.log(`- ${item.status.padEnd(2)} ${item.file}`);
  }

  console.log("");
  console.log("Areas detectadas:");
  console.log(areas.length ? areas.map((area) => `- ${area}`).join("\n") : "- none");

  console.log("");
  console.log("Checks recomendados:");
  for (const check of recommendedChecks(areas)) console.log(`- ${check}`);

  console.log("");
  console.log("Commits recientes:");
  const commits = recentCommits();
  console.log(commits.length ? commits.map((commit) => `- ${commit}`).join("\n") : "- none");

  console.log("");
  console.log("Siguiente paso sugerido:");
  console.log("- Ejecuta: pnpm agent start --agent Codex --task \"tarea corta\"");
  console.log("- Luego entrega contexto con: pnpm agent handoff --agent Codex --notes \"que cambio / que sigue\"");
}

function writeStart() {
  const agent = option("agent", "unknown-agent");
  const task = option("task", "No task provided");
  const branch = gitBranch();
  const files = changedFiles();
  const areas = detectAreas(files);
  const entry = [
    `# Handoff de agentes`,
    "",
    `Actualizado: ${now()}`,
    `Agente activo: ${agent}`,
    `Branch: ${branch}`,
    "",
    "## Tarea actual",
    task,
    "",
    "## Estado actual del repo",
    files.length ? files.map((item) => `- ${item.status} ${item.file}`).join("\n") : "- Working tree limpio",
    "",
    "## Areas en juego",
    areas.length ? areas.map((area) => `- ${area}`).join("\n") : "- ninguna detectada todavia",
    "",
    "## Checks recomendados",
    recommendedChecks(areas).map((check) => `- ${check}`).join("\n"),
    "",
    "## Notes",
    "- Agrega decisiones, bloqueos y archivos exactos antes de cambiar de agente.",
    "",
  ].join("\n");

  ensureScratch();
  writeFileSync(handoffFile, entry, "utf8");
  appendFileSync(logFile, `[${now()}] ${agent} started: ${task}\n`, "utf8");
  console.log(`Wrote ${relative(root, handoffFile)}`);
}

function appendHandoff() {
  const agent = option("agent", "unknown-agent");
  const notes = option("notes", "No notes provided");
  const files = changedFiles();
  const areas = detectAreas(files);
  const block = [
    "",
    "---",
    "",
    `## Handoff de ${agent} en ${now()}`,
    "",
    "### Notes",
    notes,
    "",
    "### Estado del repo",
    files.length ? files.map((item) => `- ${item.status} ${item.file}`).join("\n") : "- Working tree limpio",
    "",
    "### Siguientes checks sugeridos",
    recommendedChecks(areas).map((check) => `- ${check}`).join("\n"),
    "",
  ].join("\n");

  ensureScratch();
  appendFileSync(handoffFile, block, "utf8");
  appendFileSync(logFile, `[${now()}] ${agent} handoff: ${notes}\n`, "utf8");
  console.log(`Updated ${relative(root, handoffFile)}`);
}

function verify() {
  const files = changedFiles();
  const areas = detectAreas(files);
  const checks = recommendedChecks(areas);

  console.log("Plan de verificacion");
  console.log("====================");
  for (const check of checks) console.log(`- ${check}`);

  if (hasFlag("run")) {
    console.log("");
    for (const check of checks) {
      console.log(`> ${check}`);
      const [bin, ...binArgs] = check.split(" ");
      console.log(run(bin, binArgs, { stdio: ["ignore", "pipe", "pipe"] }));
    }
  }
}

function help() {
  console.log(`Uso:
  pnpm agent status
  pnpm agent start --agent Codex --task "Fix TPV payment modal"
  pnpm agent handoff --agent Codex --notes "Implemented X, next verify Y"
  pnpm agent verify
  pnpm agent verify --run

Tips:
  - Corre status antes de tomar trabajo de otro agente.
  - Corre start cuando empiezas una tarea.
  - Corre handoff antes de pasar de Codex a Antigravity o al reves.
  - Usa verify para obtener la lista minima util de checks segun los archivos tocados.`);
}

switch (command) {
  case "status":
    printStatus();
    break;
  case "start":
    writeStart();
    break;
  case "handoff":
    appendHandoff();
    break;
  case "verify":
    verify();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    help();
    process.exitCode = 1;
}
