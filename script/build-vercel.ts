// Builds the app for Vercel using the Build Output API (.vercel/output):
//   static/            the Vite frontend, served from Vercel's CDN
//   functions/api.func the whole Express API bundled into one Node function
// Run by Vercel via `npm run vercel-build`; can also be run locally to check the bundle.
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const OUT = ".vercel/output";
const FUNC = `${OUT}/functions/api.func`;

// Native or optional modules that can't be bundled; copied into the function with their dependencies.
const NATIVE = ["sharp"];
// Optional add-ons that libraries try to load but work without.
const OPTIONAL = ["pg-native", "bufferutil", "utf-8-validate"];

// Copies a package and everything it depends on (as installed) into the function's node_modules.
async function copyWithDependencies(name: string, seen = new Set<string>()) {
  if (seen.has(name)) return;
  const dir = path.join("node_modules", name);
  if (!existsSync(dir)) return; // optional dependency not installed on this platform
  seen.add(name);
  await cp(dir, path.join(FUNC, "node_modules", name), { recursive: true, dereference: true });
  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf-8"));
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    await copyWithDependencies(dep, seen);
  }
}

async function buildVercel() {
  await rm(OUT, { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();
  await cp("dist/public", `${OUT}/static`, { recursive: true });

  console.log("building API function...");
  await mkdir(FUNC, { recursive: true });
  await esbuild({
    entryPoints: ["server/vercel.ts"],
    platform: "node",
    target: "node22",
    bundle: true,
    format: "cjs",
    outfile: `${FUNC}/index.js`,
    define: { "process.env.NODE_ENV": '"production"' },
    external: [...NATIVE, ...OPTIONAL],
    minify: true,
    // Vercel calls module.exports; keep .default too for tools that look for it.
    footer: { js: "module.exports = Object.assign(module.exports.default, module.exports);" },
    logLevel: "info",
  });
  // The project is an ES module package; this bundle is CommonJS.
  await writeFile(`${FUNC}/package.json`, JSON.stringify({ type: "commonjs" }));
  for (const name of NATIVE) await copyWithDependencies(name);

  await writeFile(`${FUNC}/.vc-config.json`, JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.js",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    maxDuration: 60,
    regions: ["cle1"], // Ohio, next to the Supabase database (us-east-2)
  }, null, 2));

  await writeFile(`${OUT}/config.json`, JSON.stringify({
    version: 3,
    routes: [
      { src: "^/api(/.*)?$", dest: "/api" },
      { handle: "filesystem" },
      // Everything else is a page of the single-page app.
      { src: "/(.*)", dest: "/index.html" },
    ],
  }, null, 2));

  console.log(`done: ${OUT}`);
}

buildVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
