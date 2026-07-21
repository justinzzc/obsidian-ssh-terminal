import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, "release", `${process.platform}-${process.arch}`);
const keytarRoot = path.join(root, "node_modules", "keytar");
const keytarBinary = path.join(keytarRoot, "build", "Release", "keytar.node");

// 原生钥匙串模块必须与当前构建平台匹配，缺失时拒绝生成误导性的发布包。
await readFile(keytarBinary);
await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "versions.json", "styles.css"]) {
  await cp(path.join(root, file), path.join(target, file));
}
await cp(keytarRoot, path.join(target, "node_modules", "keytar"), { recursive: true });
await writeFile(
  path.join(target, "PLATFORM.txt"),
  `platform=${process.platform}\narch=${process.arch}\n`,
  "utf8"
);
console.log(`Release package created at ${target}`);
