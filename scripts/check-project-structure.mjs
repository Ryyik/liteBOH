#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_IGNORES = new Set([".git", "node_modules", "dist"]);
const VIEWS_ROOT = "src/views";
const MIGRATIONS_ROOT = "supabase/migrations";
const ROUTER_ROOT = "src/router";
const LARGE_FILE_LINE_LIMITS = {
  ".css": 2000,
  ".js": 2500,
  ".ts": 2500,
  ".vue": 2500,
};

const walkFiles = (root, ignores = DEFAULT_IGNORES) => {
  const files = [];

  const visit = (dir) => {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignores.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  };

  visit(root);
  return files;
};

const normalize = (projectRoot, filePath) => path.relative(projectRoot, filePath).split(path.sep).join("/");

const collectRouteImportIssues = (projectRoot) => {
  const routerDir = path.join(projectRoot, ROUTER_ROOT);
  const routerFiles = walkFiles(routerDir).filter((file) => file.endsWith(".js"));
  const issues = [];

  for (const file of routerFiles) {
    const source = readFileSync(file, "utf8");
    const importMatches = source.matchAll(/import\((['"`])([^'"`]+\.vue)\1\)/g);

    for (const match of importMatches) {
      const request = match[2];
      const resolved = path.resolve(path.dirname(file), request);
      if (!existsSync(resolved)) {
        issues.push(`路由组件不存在: ${normalize(projectRoot, file)} -> ${request}`);
      }
    }
  }

  return issues;
};

const stripCommentsAndStrings = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n\r]*/g, " ")
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, " ")
  .replace(/'(?:\\.|[^'\\])*'/g, " ")
  .replace(/"(?:\\.|[^"\\])*"/g, " ");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseExportedNames = (exportList) => exportList
  .split(",")
  .map((part) => part.replace(/\/\*[\s\S]*?\*\//g, "").trim())
  .filter(Boolean)
  .map((part) => part.split(/\s+as\s+/)[0]?.trim())
  .filter(Boolean);

const collectLocalBindings = (source) => {
  const bindings = new Set();
  const sourceWithoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n\r]*/g, " ");
  const namedImportPattern = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];?/g;
  const declarationPattern = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)\b/g;
  let match;

  while ((match = namedImportPattern.exec(sourceWithoutComments))) {
    for (const part of match[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const localName = cleaned.split(/\s+as\s+/).pop()?.trim();
      if (localName) bindings.add(localName);
    }
  }

  while ((match = declarationPattern.exec(sourceWithoutComments))) {
    bindings.add(match[1]);
  }

  return bindings;
};

const collectReExportRuntimeBindingIssues = (projectRoot) => {
  const srcDir = path.join(projectRoot, "src");
  if (!existsSync(srcDir)) return [];

  const issues = [];
  const sourceFiles = walkFiles(srcDir)
    .filter((file) => /\.(vue|js|ts)$/.test(file));

  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    const reExportPattern = /export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];?/g;
    const reExports = [];
    let match;

    while ((match = reExportPattern.exec(source))) {
      reExports.push({
        start: match.index,
        end: reExportPattern.lastIndex,
        names: parseExportedNames(match[1]),
      });
    }

    if (reExports.length === 0) continue;

    const reExportNames = [...new Set(reExports.flatMap((item) => item.names))];
    if (reExportNames.length === 0) continue;

    const sourceWithoutReExports = reExports.reduceRight(
      (current, item) => `${current.slice(0, item.start)}${current.slice(item.end)}`,
      source
    );
    const localBindings = collectLocalBindings(sourceWithoutReExports);
    const searchableSource = stripCommentsAndStrings(sourceWithoutReExports);

    for (const name of reExportNames) {
      if (localBindings.has(name)) {
        continue;
      }

      const runtimeReferencePattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "m");
      if (runtimeReferencePattern.test(searchableSource)) {
        issues.push(`转发导出未创建本地绑定，但文件内部引用了 ${name}: ${normalize(projectRoot, file)}`);
      }
    }
  }

  return issues;
};

const collectStructureReport = (projectRoot = process.cwd()) => {
  const errors = [];
  const warnings = [];
  const viewsDir = path.join(projectRoot, VIEWS_ROOT);
  const migrationsDir = path.join(projectRoot, MIGRATIONS_ROOT);

  if (existsSync(viewsDir)) {
    const topLevelViews = readdirSync(viewsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".vue"))
      .map((entry) => `${VIEWS_ROOT}/${entry.name}`);

    for (const file of topLevelViews) {
      errors.push(`顶层 views 单文件页面仍存在: ${file}，请迁移为 PageName/index.vue`);
    }
  }

  for (const file of walkFiles(projectRoot)) {
    const relative = normalize(projectRoot, file);
    if (path.basename(file) === ".DS_Store") {
      warnings.push(`发现 macOS 元数据文件，建议清理: ${relative}`);
    }
  }

  if (existsSync(migrationsDir)) {
    for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
      if (entry.isFile() && !entry.name.endsWith(".sql")) {
        errors.push(`supabase/migrations 只能放可执行 SQL: ${MIGRATIONS_ROOT}/${entry.name}`);
      }
    }
  }

  errors.push(...collectRouteImportIssues(projectRoot));
  errors.push(...collectReExportRuntimeBindingIssues(projectRoot));

  const viteConfig = path.join(projectRoot, "vite.config.js");
  if (existsSync(viteConfig)) {
    const source = readFileSync(viteConfig, "utf8");
    if (source.includes("src/assets/styles")) {
      errors.push("vite.config.js 的 @styles 仍指向 src/assets/styles，应指向 src/styles");
    }
  }

  const runtimeImageFiles = walkFiles(path.join(projectRoot, "src/assets/images"))
    .map((file) => normalize(projectRoot, file));
  const rawRuntimeImages = runtimeImageFiles.filter((file) => /\.(png|jpe?g)$/i.test(file));
  for (const file of rawRuntimeImages) {
    errors.push(`运行时图片目录只保留 WebP/SVG，请将原图归档到 docs/assets-source/images: ${file}`);
  }

  const sourceFiles = walkFiles(path.join(projectRoot, "src"))
    .filter((file) => /\.(vue|js|ts|css)$/.test(file))
    .map((file) => ({
      file,
      lines: readFileSync(file, "utf8").split(/\r?\n/).length,
    }))
    .sort((a, b) => b.lines - a.lines);

  for (const item of sourceFiles.slice(0, 20)) {
    const relative = normalize(projectRoot, item.file);
    const ext = path.extname(item.file);
    const limit = LARGE_FILE_LINE_LIMITS[ext] || 3000;
    if (item.lines >= limit) {
      warnings.push(`超大文件建议拆分: ${relative} (${item.lines} 行，建议阈值 ${limit} 行)`);
    }
  }

  return { errors, warnings };
};

const runCli = () => {
  const report = collectStructureReport(process.cwd());

  for (const warning of report.warnings) {
    console.warn(`[check:structure] WARN ${warning}`);
  }

  if (report.errors.length === 0) {
    console.log("[check:structure] Passed. Project structure checks are clean.");
    return;
  }

  console.error("[check:structure] Found structure issues:");
  for (const error of report.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
};

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli();
}

export { collectReExportRuntimeBindingIssues, collectStructureReport };
