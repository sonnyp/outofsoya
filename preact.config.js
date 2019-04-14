import preactCliTypeScript from "preact-cli-plugin-typescript";
import asyncPlugin from "preact-cli-plugin-async";

export default function(config) {
  preactCliTypeScript(config);
  asyncPlugin(config);
}
