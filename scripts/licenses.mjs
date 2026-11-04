import fs from "node:fs";
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const name of Object.keys({ ...p.dependencies, ...p.devDependencies })) {
  const dep = JSON.parse(
    fs.readFileSync(`node_modules/${name}/package.json`, "utf8"),
  );
  console.log(`${name}\t${dep.version}\t${dep.license || "REVIEW REQUIRED"}`);
}
