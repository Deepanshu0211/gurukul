// Load only the public configuration for an explicitly selected database.
// Private database/service-role credentials never enter the Expo child process.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const [target, ...args] = process.argv.slice(2);
const refs = { mock: "ofuvjzxjbgsityacukva", pilot: "qpwfmdddvpmnqlwqrzke" };
if (!refs[target]) throw new Error("Choose mock or pilot");
const root = path.resolve(__dirname, "..");
const file = path.resolve(root, "../_private-real-data", `.env.${target}.local`);
const values = Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const url = values.EXPO_PUBLIC_SUPABASE_URL;
const key = values.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (url !== `https://${refs[target]}.supabase.co` || !key) {
  throw new Error("Selected environment has missing or unexpected app configuration");
}
const env = { ...process.env, EXPO_NO_DOTENV: "1", EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key };
for (const name of Object.keys(env)) {
  if (name.startsWith("SUPABASE_")) delete env[name];
}
console.log(`Expo target: ${target} (${refs[target]})`);
const command = args.length ? args : ["start"];
if (["start", "export"].includes(command[0]) && !command.includes("--clear")) command.push("--clear");
const child = spawn(process.execPath, [path.join(root, "node_modules/expo/bin/cli"), ...command], { cwd: root, env, stdio: "inherit" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
