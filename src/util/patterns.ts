/** Well-known secret file patterns to detect during scan/init */
export const SECRET_PATTERNS: string[] = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.staging",
  ".env.test",
  ".env.*",
  "secrets.json",
  "secrets.yaml",
  "secrets.yml",
  "secrets.toml",
  "config/secrets.json",
  "config/secrets.yaml",
  "config/secrets.yml",
  "config/secrets.toml",
  ".secrets",
  "credentials.json",
  "service-account.json",
  "*.pem",
  "*.key",
];

/** Glob patterns to match well-known secret files */
export const SECRET_GLOBS: string[] = [
  ".env",
  ".env.*",
  "secrets.{json,yaml,yml,toml}",
  "config/secrets.{json,yaml,yml,toml}",
  "credentials.json",
  "service-account.json",
];

/** Directories to skip when scanning */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  "target",
]);
