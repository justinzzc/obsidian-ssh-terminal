import esbuild from "esbuild";
import { fileURLToPath } from "node:url";

const production = process.argv[2] === "production";
// 使用配置文件自身定位入口，避免调用方工作目录变化导致解析错误。
const entryPoint = fileURLToPath(new URL("./src/main.ts", import.meta.url));
const outputFile = fileURLToPath(new URL("./main.js", import.meta.url));
const styleEntryPoint = fileURLToPath(new URL("./src/styles.css", import.meta.url));
const styleOutputFile = fileURLToPath(new URL("./styles.css", import.meta.url));

await esbuild.build({
  entryPoints: [entryPoint],
  bundle: true,
  // ssh2 的原生加速模块是可选依赖；运行时加载失败会自动回退纯 JavaScript。
  external: ["obsidian", "electron", "keytar", "cpu-features", "*.node"],
  format: "cjs",
  target: "es2022",
  platform: "node",
  preserveSymlinks: true,
  outfile: outputFile,
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info"
});

// 单独打包 xterm 基础样式和插件样式，输出 Obsidian 约定的 styles.css。
await esbuild.build({
  entryPoints: [styleEntryPoint],
  bundle: true,
  outfile: styleOutputFile,
  minify: production,
  preserveSymlinks: true,
  logLevel: "info"
});
