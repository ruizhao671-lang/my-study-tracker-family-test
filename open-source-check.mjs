import { readFile } from "node:fs/promises";

const files = {
  readme: await readFile("README.md", "utf8"),
  license: await readFile("LICENSE", "utf8"),
  envExample: await readFile(".env.example", "utf8"),
  gitignore: await readFile(".gitignore", "utf8"),
  render: await readFile("render.yaml", "utf8"),
  backend: await readFile("backend/app.py", "utf8"),
  frontend: await readFile("public/index.html", "utf8")
};

const checks = [
  ["README explains the project", files.readme.includes("# Study Tracker") && files.readme.includes("Tech Stack")],
  ["MIT license exists", files.license.includes("MIT License")],
  [".env.example uses placeholders only", files.envExample.includes("DATABASE_URL=") && !files.envExample.includes("postgresql://")],
  [".gitignore excludes local secrets", files.gitignore.includes(".env") && files.gitignore.includes("*.sqlite")],
  ["Render blueprint does not commit secret values", files.render.includes("sync: false") && !files.render.includes("postgresql://")],
  ["Backend hashes passwords", files.backend.includes("pbkdf2_hmac") && files.backend.includes("password_hash")],
  ["Frontend does not contain the live Render URL", !files.frontend.includes("study-tracker-family-test.onrender.com")]
];

const failed = checks.filter(([, passed]) => !passed);
checks.forEach(([label, passed]) => console.log(`${passed ? "PASS" : "FAIL"} ${label}`));

if (failed.length) {
  process.exitCode = 1;
}
