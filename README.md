# bwrss — Bitwarden Repository Settings Sync

A CLI tool that syncs git repo secret files (`.env`, `secrets.json`, etc.) to and from [Bitwarden](https://bitwarden.com) via the `bw` CLI. Declare which files to manage in a `.bwrss` config, then save and restore secrets across machines.

## Prerequisites

### 1. Install the Bitwarden CLI

```bash
# npm
npm install -g @bitwarden/cli

# or snap (Linux)
sudo snap install bw

# or brew (macOS)
brew install bitwarden-cli
```

Verify it's installed:

```bash
bw --version
```

### 2. Log in and unlock your vault

```bash
# Log in (only needed once per machine)
bw login

# Unlock the vault and export the session key
export BW_SESSION=$(bw unlock --raw)
```

The `BW_SESSION` environment variable must be set for `bwrss save` and `bwrss restore` to work. Add it to your shell profile or run `export BW_SESSION=$(bw unlock --raw)` at the start of each terminal session.

You can verify your vault is unlocked:

```bash
bw status | jq .status
# should print "unlocked"
```

### 3. Install bwrss

Run directly without installing (requires bun):

```bash
bunx bwrss <command>
```

Or install globally:

```bash
bun install -g bwrss
```

`npx` also works if you have bun installed (the shebang uses `#!/usr/bin/env bun`):

```bash
npx bwrss <command>
```

#### Build from source

```bash
git clone https://github.com/espresso3389/bwrss && cd bw-secret-sync
bun install
bun run build

# The compiled binary is at ./bwrss — no bun needed at runtime
cp bwrss ~/.local/bin/
```

## Usage

### Scan for repos with secret files

```bash
bwrss scan ~/projects
```

Recursively finds git repos under the given directories, detects well-known secret files (`.env`, `secrets.json`, etc.), and prints a summary table showing which repos have a `.bwrss` config and which don't.

### Initialize a `.bwrss` config

```bash
bwrss init ~/projects
```

For each discovered repo, generates a `.bwrss` config file that lists detected secret files. Skips repos that already have one (use `--force` to overwrite).

You can also point at a single repo:

```bash
bwrss init ./my-project
```

### Save secrets to Bitwarden

```bash
bwrss save ~/projects
```

Reads each repo's `.bwrss` config, collects the declared files, and uploads them to Bitwarden as a secure note named `bwrss:<repo-name>`. Repos without a `.bwrss` config are skipped.

Preview what would be saved without writing anything:

```bash
bwrss save --dry-run ~/projects
```

### Restore secrets from Bitwarden

```bash
bwrss restore ~/projects
```

Downloads secrets from Bitwarden and writes them back to the local file system. For full files, the file is recreated. For partial key management, keys are merged into the existing file.

Options:

```bash
bwrss restore --dry-run ~/projects   # preview without writing files
bwrss restore --force ~/projects     # overwrite existing local files
```

## The `.bwrss` config file

The config is a YAML file placed at the root of a git repo:

```yaml
version: 1
name: "my-project"  # optional, defaults to git remote or directory name
files:
  - path: ".env"                          # full file — entire contents saved
  - path: ".env.production"
    keys: ["DB_PASSWORD", "API_SECRET_*"] # partial — only matching keys
  - path: "config/secrets.yaml"
    keys: ["database.password", "aws.*"]  # dot-path for nested formats
```

### Full vs. partial file management

- **No `keys`**: the entire file is saved/restored verbatim (preserves comments, formatting).
- **With `keys`**: only matching key-value pairs are saved. On restore, they're merged into the existing local file without disturbing other content.

### Key syntax by format

| Format | Key syntax | Examples |
|--------|-----------|----------|
| `.env` / INI | Top-level key name | `DB_PASSWORD`, `API_*` |
| JSON | Dot-path | `secrets.apiKey`, `db.*` |
| YAML | Dot-path | `database.password`, `aws.*` |
| TOML | Dot-path | `server.credentials.*` |

Glob patterns (`*`) match any characters within a single path segment.

## How it stores data in Bitwarden

Each repo gets one **secure note** named `bwrss:<canonical-name>` (e.g., `bwrss:github.com/user/repo`):

- **`notes` field**: metadata (version, repo name, timestamp, file list)
- **Attachment `bwrss-data.json`**: the actual secret data

## Typical workflow

```bash
# First time setup on a machine
bw login
export BW_SESSION=$(bw unlock --raw)

# Scan your projects directory
bwrss scan ~/projects

# Initialize configs for discovered repos
bwrss init ~/projects

# Edit .bwrss files if needed (e.g., add key filters)
# Then save secrets to Bitwarden
bwrss save ~/projects

# On a new machine, after cloning repos:
bwrss restore ~/projects
```

## Development

```bash
bun install          # install dependencies
bun test             # run tests
bun run start        # run CLI directly
bun run build        # compile standalone binary
```
