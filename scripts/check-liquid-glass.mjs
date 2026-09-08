#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const ignored = new Set(["node_modules", "dist"]);
const extensions = /\.(css|scss|vue)$/;
const violations = [];

const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && extensions.test(entry.name)) {
      const source = readFileSync(file, "utf8");
      const patterns = [
        /--glass-filter-(?:light|medium|heavy)\s*:\s*var\(--glass-filter-/,
        /blur\(18px\)\s+saturate\(180%\)\s+brightness\(1\.02\)/,
        /blur\(28px\)\s+saturate\(180%\)\s+brightness\(1\.02\)/,
        /blur\(36px\)\s+saturate\(180%\)\s+brightness\(1\.02\)/,
      ];
      const isLiquidImplementation = file.endsWith(path.join("common", "liquid-glass.css"));
      if (!isLiquidImplementation) {
        patterns.push(/(?:-webkit-)?backdrop-filter\s*:\s*blur\((?:1[4-9]|[2-9]\d)px\)/);
      }
      patterns.forEach((pattern) => {
        if (pattern.test(source)) violations.push(`${path.relative(process.cwd(), file)}: ${pattern}`);
      });
    }
  }
};

walk(root);

if (violations.length) {
  console.error("[check:liquid-glass] Found duplicate glass material definitions:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log("[check:liquid-glass] Liquid Glass material checks passed.");
}
