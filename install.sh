#!/usr/bin/env bash
# Adania Client — one-command macOS install + build + launch.
#   curl-clone the repo, then:  ./install.sh
# It will: ensure Deno (canary, for `deno desktop`), ensure pnpm, build the Next app, compile the
# native .app, confirm the macOS Keychain is usable (the app stores your session token there on
# sign-in), and open the app. Re-run any time to rebuild.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
say() { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }
die() { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "macOS only (uses .app + Keychain)."

# ---- 1. Deno (canary — `deno desktop` ships in canary today) ----
DENO="$(command -v deno || true)"
need_deno=1
if [ -n "$DENO" ] && "$DENO" desktop --help >/dev/null 2>&1; then need_deno=0; fi
if [ "$need_deno" = 1 ]; then
  say "Installing Deno canary (for deno desktop) → ~/.deno"
  case "$(uname -m)" in
    arm64) target="aarch64-apple-darwin" ;;
    x86_64) target="x86_64-apple-darwin" ;;
    *) die "unsupported arch $(uname -m)" ;;
  esac
  hash="$(curl -fsSL https://dl.deno.land/canary-latest.txt)"
  mkdir -p "$HOME/.deno/bin"
  curl -fsSL -o /tmp/adania-deno.zip "https://dl.deno.land/canary/${hash}/deno-${target}.zip"
  unzip -oq /tmp/adania-deno.zip -d "$HOME/.deno/bin"
  chmod +x "$HOME/.deno/bin/deno"
  xattr -d com.apple.quarantine "$HOME/.deno/bin/deno" 2>/dev/null || true
  DENO="$HOME/.deno/bin/deno"
  grep -q '.deno/bin' "$HOME/.zshrc" 2>/dev/null || echo 'export PATH="$HOME/.deno/bin:$PATH"' >> "$HOME/.zshrc"
  say "Deno installed. (Added ~/.deno/bin to ~/.zshrc — open a new terminal to use \`deno\` directly.)"
fi
"$DENO" desktop --help >/dev/null 2>&1 || die "this Deno has no \`desktop\` subcommand — update canary."
say "Deno: $("$DENO" --version | head -1)"

# ---- 2. Node + pnpm ----
command -v node >/dev/null 2>&1 || die "Node.js 18+ required (https://nodejs.org or: brew install node)."
PNPM="$(command -v pnpm || true)"
if [ -z "$PNPM" ]; then
  say "Enabling pnpm via corepack"
  corepack enable >/dev/null 2>&1 || die "could not enable pnpm (run: npm i -g pnpm)"
  PNPM="$(command -v pnpm)"
fi

# ---- 3. Keychain check (the app writes your session token to login.keychain on sign-in) ----
security list-keychains >/dev/null 2>&1 && say "macOS Keychain OK (token stored on sign-in)." \
  || say "warning: could not query the Keychain; the app will fall back to a 0600 file."

# ---- 4. Build the Next app + the native .app ----
cd "$here/app"
say "Installing app dependencies"
"$PNPM" install
say "Building the UI (next build)"
"$PNPM" build
say "Compiling the desktop app (deno desktop) — this embeds the runtime; first build is slow"
mkdir -p "$here/dist"
"$DENO" desktop --output "$here/dist/AdaniaClient.app" \
  --allow-read --allow-write --allow-env --allow-sys --allow-net --allow-run .

# ---- 5. Launch ----
say "Opening Adania Client"
open "$here/dist/AdaniaClient.app"
cat <<EOF

✅ Done. Adania Client is open.
   • Click "Sign in with Cognito" and authenticate.
   • Keep this app running — it holds the connection that receives your assigned agents' events.
   • Rebuild any time with: ./install.sh
EOF
