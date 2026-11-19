import { mkdir, readdir, readFile } from "node:fs/promises";
import { extname } from "node:path";
import { build } from "esbuild";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const files = (await readdir("public")).sort();
const assets = Object.fromEntries(await Promise.all(files.map(async (file) => {
  const mime = types[extname(file)];
  if (!mime) throw new Error(`Missing content type for ${file}`);
  const route = file === "index.html" ? "/" : `/${file}`;
  return [route, { mime, body: await readFile(`public/${file}`, "utf8") }];
})));

await mkdir("dist/server", { recursive: true });
await build({
  stdin: {
    contents: `import { makeSite } from "./hosting/site.js"; export default makeSite(${JSON.stringify(assets)});`,
    resolveDir: process.cwd(),
  },
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
});
