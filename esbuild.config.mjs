import esbuild from "esbuild";

const production = process.argv[2] === "production";

await esbuild.build({
  absWorkingDir: process.cwd(),
  entryPoints: ["./src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "keytar"],
  format: "cjs",
  target: "es2022",
  platform: "node",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info"
});
