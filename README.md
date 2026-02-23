# bwrss — Bitwarden Repository Settings Sync

A CLI tool that syncs git repo secret files (`.env`, `secrets.json`, etc.) and home directory secrets (SSH keys, AWS credentials, etc.) to and from [Bitwarden](https://bitwarden.com) via the `bw` CLI.

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

The `BW_SESSION` environment variable must be set for commands that interact with Bitwarden. Add it to your shell profile or run `export BW_SESSION=$(bw unlock --raw)` at the start of each terminal session.

You can also pass it explicitly:

```bash
bwrss --bw-session <session> ...
```

### 3. Install bwrss

Run directly without installing:

```bash
npx bwrss-cli <command>
# or
bunx bwrss-cli <command>
```

Or install globally (the command is `bwrss`):

```bash
npm install -g bwrss-cli
# or
bun install -g bwrss-cli
```

#### Build from source

```bash
git clone https://github.com/espresso3389/bwrss-cli && cd bwrss-cli
bun install
bun run build          # builds dist/index.js (runs on Node)
bun run build:bun      # builds standalone binary (no runtime needed)
```

## Usage

All repo commands default to the current directory if no directories are specified.

### Scan for repos with secret files

```bash
bwrss scan ~/projects
bwrss scan              # scans current directory
```

Recursively finds git repos under the given directories, detects well-known secret files (`.env`, `secrets.json`, etc.), and prints a summary table showing which repos have a `.bwrss` config and which don't.

```
Repository Scan Results
────────────────────────────────────────────────────────────────────────────────
Repository                              Status        Secrets   Managed
────────────────────────────────────────────────────────────────────────────────
/home/user/projects/webapp              configured    3         3
/home/user/projects/api-server          configured    2         1
/home/user/projects/cli-tool            unmanaged     1         -
/home/user/projects/docs                unmanaged     0         -
────────────────────────────────────────────────────────────────────────────────
4 repos found, 2 configured, 2 unmanaged
```

### Initialize a `.bwrss` config

```bash
bwrss init ~/projects
bwrss init              # initializes current directory
```

For each discovered repo, generates a `.bwrss` config file that lists detected secret files. Skips repos that already have one (use `--force` to overwrite).

### Save secrets to Bitwarden

```bash
bwrss save ~/projects
bwrss save              # saves current repo
bwrss save --dry-run    # preview without writing to Bitwarden
```

Reads each repo's `.bwrss` config, collects the declared files, and uploads them to Bitwarden as a secure note named `bwrss:<repo-name>`. Repos without a `.bwrss` config are skipped.

Files marked as `machine: true` are stored separately as `bwrss:<repo-name>@<machine>`.

### Restore secrets from Bitwarden

```bash
bwrss restore ~/projects
bwrss restore --dry-run    # preview without writing files
bwrss restore --force      # overwrite existing local files
```

Downloads secrets from Bitwarden and writes them back to the local file system. For full files, the file is recreated. For partial key management, keys are merged into the existing file. File permissions are restored if they were captured on save.

## The `.bwrss` config file

The config is a YAML file placed at the root of a git repo:

```yaml
version: 1
name: "my-project"  # optional, defaults to git remote or directory name
files:
  - path: ".env"                          # full file — entire contents saved
  - path: ".env.production"
    keys: ["DB_PASSWORD", "API_SECRET_*"] # partial — only matching keys
  - path: ".env.local"
    machine: true                         # stored per-machine, not shared
  - path: "config/secrets.yaml"
    keys: ["database.password", "aws.*"]  # dot-path for nested formats
```

### Full vs. partial file management

- **No `keys`**: the entire file is saved/restored verbatim (preserves comments, formatting).
- **With `keys`**: only matching key-value pairs are saved. On restore, they're merged into the existing local file without disturbing other content.

### Machine-specific files

Files with `machine: true` are stored per-machine in a separate Bitwarden item (`bwrss:<name>@<machine>`). This is useful for files that differ between machines, such as SSH private keys or machine-specific credentials.

### Key syntax by format

| Format | Key syntax | Examples |
|--------|-----------|----------|
| `.env` / INI | Top-level key name | `DB_PASSWORD`, `API_*` |
| JSON | Dot-path | `secrets.apiKey`, `db.*` |
| YAML | Dot-path | `database.password`, `aws.*` |
| TOML | Dot-path | `server.credentials.*` |

Glob patterns (`*`) match any characters within a single path segment.

## Home directory secrets

bwrss can also manage secrets scattered across your home directory — SSH keys, AWS credentials, GitHub CLI auth, and more.

### Quick start

```bash
export BW_SESSION=$(bw unlock --raw)

bwrss home init          # detect secrets, set machine name, create config
bwrss home save          # upload to Bitwarden
bwrss home restore       # download from Bitwarden on a new machine
```

### Home commands

#### `bwrss home init [--force]`

Scans `$HOME` for well-known secret files, creates `~/.config/bwrss/home.yaml`, and prompts for a machine name. If a config already exists, shows the current file list (use `--force` to recreate).

#### `bwrss home list`

Shows all managed files with their storage type (shared/machine-specific) and status (present/missing/ignored).

```
Managed Home Files
────────────────────────────────────────────────────────────
File                                    Storage           Status
────────────────────────────────────────────────────────────
~/.gitconfig                            shared            present
~/.aws/config                           shared            present
~/.npmrc                                machine-specific  present
~/.ssh/id_ed25519                       machine-specific  ignored
────────────────────────────────────────────────────────────
3 managed, 2 shared, 1 machine-specific, 1 ignored

Config: /home/user/.config/bwrss/home.yaml
```

#### `bwrss home scan [--update]`

Scans for well-known secret files and shows what's new, managed, or ignored. Use `--update` to add newly detected files to the config.

#### `bwrss home add <file> [--machine]`

Add a file to the home config. Paths can use `~/` prefix or be relative to `$HOME`.

```bash
bwrss home add ~/.gnupg/secring.gpg --machine
bwrss home add .config/starship.toml
```

#### `bwrss home remove <file>`

Remove a file from the home config.

```bash
bwrss home remove ~/.npmrc
```

#### `bwrss home ignore [pattern] [--remove] [--list]`

Manage ignore patterns. Ignored files are skipped by `scan --update` and shown as "ignored" in `list`.

```bash
bwrss home ignore .ssh/          # ignore everything under ~/.ssh/
bwrss home ignore ".ssh/id_*"    # ignore SSH key files
bwrss home ignore --list         # show current patterns
bwrss home ignore --remove .ssh/ # un-ignore
```

Patterns support `*` wildcards and trailing `/` for directory prefixes. Absolute paths and `~/` prefixes are normalized automatically.

#### `bwrss home save [--dry-run]`

Save home secrets to Bitwarden. Shared files go to `bwrss:home`, machine-specific files go to `bwrss:home@<machine>`.

#### `bwrss home restore [--dry-run] [--force]`

Restore home secrets from Bitwarden. Parent directories are created automatically (e.g. `~/.ssh/`). File permissions are restored.

### Home config file

Located at `~/.config/bwrss/home.yaml`:

```yaml
version: 1
name: home
files:
  - path: .ssh/config
  - path: .gitconfig
  - path: .npmrc
    machine: true
  - path: .ssh/id_ed25519
    machine: true
  - path: .ssh/id_ed25519.pub
    machine: true
ignored-files:
  - .kube/
  - .docker/config.json
```

### Well-known home secrets

`home init` and `home scan` detect these files automatically:

| Path | Default storage | Notes |
|------|----------------|-------|
| `.ssh/id_*` | machine-specific | Private keys and public keys |
| `.ssh/config` | shared | SSH connection settings |
| `.aws/credentials` | machine-specific | AWS access keys |
| `.aws/config` | shared | AWS region/profile settings |
| `.config/gh/hosts.yml` | machine-specific | GitHub CLI OAuth tokens |
| `.npmrc` | machine-specific | npm auth tokens |
| `.pypirc` | machine-specific | PyPI auth tokens |
| `.netrc` | machine-specific | Login credentials |
| `.kube/config` | machine-specific | Kubernetes cluster config |
| `.docker/config.json` | machine-specific | Docker registry auth |
| `.gitconfig` | shared | Git aliases and settings |

### Machine config

Located at `~/.config/bwrss/config.yaml`:

```yaml
machine: mypc
```

The machine name identifies this computer for machine-specific secret storage. It is set during `home init` and used by `save`/`restore` to route files to the correct Bitwarden items.

When the machine name is not yet configured, bwrss queries Bitwarden for known machines and presents a chooser with last save timestamps:

```
Known machines (from Bitwarden):
  1) mypc *     (last save: 3 days ago)
  2) work-laptop (last save: today)

  * = current machine

Select a machine number or type a new name [mypc]:
```

## How it stores data in Bitwarden

Each repo or home config gets **secure notes** in Bitwarden:

| Item name | Contents |
|-----------|----------|
| `bwrss:<name>` | Shared secrets (same across all machines) |
| `bwrss:<name>@<machine>` | Machine-specific secrets |

For example:
- `bwrss:github.com/user/repo` — shared repo secrets
- `bwrss:home` — shared home secrets
- `bwrss:home@mypc` — home secrets specific to `mypc`

Each item contains:
- **`notes` field**: metadata JSON (version, name, timestamp, file list)
- **Attachment `bwrss-data.json`**: the actual secret payloads with file permissions and encoding info

## Typical workflow

### Repository secrets

```bash
# First time setup
export BW_SESSION=$(bw unlock --raw)

# Scan and initialize
bwrss scan ~/projects
bwrss init ~/projects

# Edit .bwrss files if needed, then save
bwrss save ~/projects

# On a new machine, after cloning repos:
bwrss restore ~/projects
```

### Home directory secrets

```bash
# Set up on your primary machine
export BW_SESSION=$(bw unlock --raw)

bwrss home init              # detects secrets, sets machine name
bwrss home ignore .kube/     # optionally ignore some paths
bwrss home save              # upload to Bitwarden

# On a new machine:
export BW_SESSION=$(bw unlock --raw)

bwrss home init              # pick machine name (or reuse existing)
bwrss home restore --force   # download and write all files
```

## Development

```bash
bun install          # install dependencies
bun test             # run tests
bun run start        # run CLI directly
bun run build        # compile standalone binary
```
