#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const viewsRoot = path.resolve(projectRoot, "src/views");

if (!existsSync(viewsRoot)) {
  console.error(`[check:views] Missing directory: ${path.relative(projectRoot, viewsRoot)}`);
  process.exit(1);
}

/**
 * Find same-level collisions like:
 * - src/views/Foo.vue
 * - src/views/Foo/
 */
const collisions = [];

const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const folderNames = new Set();
  const viewNames = new Set();

  for (const entry of entries) {
    if (entry.isDirectory()) {
      folderNames.add(entry.name);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".vue")) {
      viewNames.add(entry.name.slice(0, -4));
    }
  }

  for (const viewName of viewNames) {
    if (!folderNames.has(viewName)) {
      continue;
    }

    collisions.push({
      file: path.relative(projectRoot, path.join(dir, `${viewName}.vue`)),
      folder: path.relative(projectRoot, path.join(dir, viewName)),
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    walk(path.join(dir, entry.name));
  }
};

walk(viewsRoot);

if (collisions.length === 0) {
  console.log("[check:views] Passed. No .vue + same-name folder collisions found in src/views.");
  process.exit(0);
}

console.error("[check:views] Found naming collisions in src/views:");
for (const collision of collisions.sort((a, b) => a.file.localeCompare(b.file))) {
  console.error(`- ${collision.file} <-> ${collision.folder}`);
}
console.error("Resolve by keeping a single entry point, preferably folder/index.vue.");
process.exit(1);
