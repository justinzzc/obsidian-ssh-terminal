import esbuild from "esbuild";
import { fileURLToPath } from "node:url";

const production = process.argv[2] === "production";
// 使用配置文件自身定位入口，避免调用方工作目录变化导致解析错误。
const entryPoint = fileURLToPath(new URL("./src/main.ts", import.meta.url));
const outputFile = fileURLToPath(new URL("./main.js", import.meta.url));

await esbuild.build({
  entryPoints: [entryPoint],
  bundle: true,
  external: ["obsidian", "electron", "keytar"],
  format: "cjs",
  target: "es2022",
  platform: "node",
  preserveSymlinks: true,
  outfile: outputFile,
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info"
});
