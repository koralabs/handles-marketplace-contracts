import appRoot from "app-root-path";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const getDirname = (calledFrom: string) => dirname(fileURLToPath(calledFrom));

const packageJson = JSON.parse(
  fs.readFileSync(path.join(appRoot.path, "package.json"), "utf-8")
);

export { getDirname, packageJson };
