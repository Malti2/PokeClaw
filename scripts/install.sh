#!/bin/sh
# Fully automatic pokeclaw installer for macOS and Linux.
# Installs Bun and git when missing, clones/updates the repo, installs
# project dependencies, links the `pokeclaw` binary onto PATH, and starts
# pokeclaw (first start asks for the Poke API key via onboarding).
#
# Quick start: download this file from the repo's scripts/ folder and run:
#   sh install.sh
set -eu

REPO_URL="https://github.com/Malti2/pokeclaw.git"
DEST="$HOME/pokeclaw"

have() { command -v "$1" >/dev/null 2>&1; }

echo "== pokeclaw installer =="

# 1. Bun (download the installer to a temp file first so it can be inspected,
#    then run it - no piped shell)
if ! have bun; then
  echo "Installing Bun..."
  BUN_DL_HOST="bun.sh"
  TMP_INSTALL="$(mktemp /tmp/bun-install.XXXXXX.sh)"
  curl -fsSL "https://$BUN_DL_HOST/install" -o "$TMP_INSTALL"
  sh "$TMP_INSTALL"
  rm -f "$TMP_INSTALL"
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
if ! have bun; then
  echo "Bun installation failed. See https://bun.sh" >&2
  exit 1
fi
echo "Bun: $(bun --version)"

# Bun >= 1.4 is required: older versions cannot parse the project's lockfile
# format and would silently rewrite it (which then blocks future git pulls).
bun_version="$(bun --version)"
bun_major="${bun_version%%.*}"
bun_minor_tmp="${bun_version#*.}"
bun_minor="${bun_minor_tmp%%.*}"
if [ "$bun_major" -lt 1 ] || { [ "$bun_major" -eq 1 ] && [ "$bun_minor" -lt 4 ]; }; then
  echo "Upgrading Bun to 1.4+ (required for the project lockfile)..."
  bun upgrade
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo "Bun: $(bun --version)"
fi

# 2. git
if ! have git; then
  echo "Installing git..."
  OS="$(uname -s)"
  if [ "$OS" = "Darwin" ]; then
    if have brew; then
      brew install git
    else
      echo "Opening Apple's command line tools installer (a dialog will appear)..."
      xcode-select --install || true
      echo "Waiting for git to appear - finish the installer dialog..."
      tries=0
      while ! have git && [ "$tries" -lt 60 ]; do
        sleep 10
        tries=$((tries + 1))
      done
    fi
  else
    if have apt-get; then
      sudo apt-get update && sudo apt-get install -y git
    elif have dnf; then
      sudo dnf install -y git
    elif have pacman; then
      sudo pacman -S --noconfirm git
    elif have zypper; then
      sudo zypper install -y git
    elif have apk; then
      sudo apk add git
    else
      echo "No supported package manager found. Install git manually and re-run this script." >&2
      exit 1
    fi
  fi
fi
if ! have git; then
  echo "git is still not available. Install it manually and re-run this script." >&2
  exit 1
fi
echo "git: $(git --version)"

# 3. Clone or update
if [ -d "$DEST/.git" ]; then
  echo "Updating existing checkout in $DEST ..."
  if git -C "$DEST" pull --ff-only; then
    :
  elif [ -n "$(git -C "$DEST" status --porcelain)" ]; then
    echo "" >&2
    echo "ERROR: cannot update $DEST - you have local changes that would be overwritten." >&2
    echo "Discard them with:  git -C \"$DEST\" stash -u" >&2
    echo "  or selectively:   git -C \"$DEST\" checkout -- <file>" >&2
    echo "Then re-run this installer." >&2
    exit 1
  else
    echo "WARNING: 'git pull' failed (offline?). Continuing with the existing checkout." >&2
  fi
elif [ ! -e "$DEST" ]; then
  echo "Cloning pokeclaw to $DEST ..."
  git clone "$REPO_URL" "$DEST"
else
  echo "$DEST exists but is not a git checkout. Move it aside and re-run this script." >&2
  exit 1
fi

# 4. Project dependencies
echo "Installing project dependencies..."
(cd "$DEST" && bun install)
# Keep the worktree clean: restore the committed lockfile in case this bun
# version normalized it (a dirty lockfile would block the next 'git pull').
git -C "$DEST" checkout -- bun.lock 2>/dev/null || true

# 5. Launcher onto PATH. A tiny sh wrapper that runs the entrypoint with bun -
# deterministic on every machine, no reliance on symlinks, shebangs or the
# exec bit surviving git.
echo "Linking the pokeclaw binary..."
(cd "$DEST" && bun link)
mkdir -p "$HOME/.bun/bin"
rm -f "$HOME/.bun/bin/pokeclaw"
printf '#!/bin/sh\nexec bun "%s/src/main.tsx" "$@"\n' "$DEST" > "$HOME/.bun/bin/pokeclaw"
chmod +x "$HOME/.bun/bin/pokeclaw"

export PATH="$HOME/.bun/bin:$PATH"

# 6. Start (first start runs the API-key onboarding)
echo ""
echo "Done!"
if have pokeclaw && pokeclaw --version >/dev/null 2>&1; then
  echo "Starting pokeclaw..."
  pokeclaw
else
  echo "'pokeclaw' binary did not start cleanly - launching via bun directly instead."
  echo "(If this keeps happening, re-run this installer after 'git pull'.)"
  bun "$DEST/src/main.tsx"
fi
