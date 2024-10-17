import typescript from "rollup-plugin-typescript2";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import { builtinModules } from "module";
import pkg from "./package.json" assert { type: "json" };

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...builtinModules,
];

export default {
  input: "./src/index.ts",
  output: {
    file: "index.cjs",
    format: "cjs",
    sourcemap: true,
    dir: "dist", // Specify your desired output directory here
  },
  plugins: [
    resolve(),
    commonjs(),
    json(),
    typescript({
      tsconfig: "tsconfig.json",
    }),
  ],
  external,
};
