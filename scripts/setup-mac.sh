#!/bin/bash
# AILI one-step setup for macOS.
# Run with:  bash ~/Downloads/setup-aili.sh
set -e

FOLDER="/Users/ryan/AI Build/Aili"
REPO="https://github.com/ryansri/AILI.git"
BRANCH="claude/linkedin-outreach-system-5e0r5u"

echo ""
echo "AILI setup"
echo "=========="

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js is not installed. Opening the download page."
  echo "Install the LTS version, close Terminal, reopen it, and run this script again."
  open "https://nodejs.org/en/download"
  exit 1
fi
echo "Node.js $(node -v) found."

# 2. Git
if ! command -v git >/dev/null 2>&1; then
  echo ""
  echo "Git is not installed. macOS will offer to install it now."
  echo "Accept, wait for it to finish, then run this script again."
  xcode-select --install || true
  exit 1
fi

# 3. Folder and code
mkdir -p "$FOLDER"
cd "$FOLDER"

if [ -d ".git" ]; then
  echo "Code already here. Getting the latest version."
  git pull
elif [ -z "$(ls -A)" ]; then
  echo "Downloading the code (GitHub may ask you to sign in)."
  git clone -b "$BRANCH" "$REPO" .
else
  echo "The folder is not empty, so the code goes in a sub-folder called app."
  if [ -d "app/.git" ]; then
    cd app && git pull
  else
    git clone -b "$BRANCH" "$REPO" app && cd app
  fi
fi

# 4. Install and database
echo ""
echo "Installing (this takes a minute or two)."
npm install
npm run db:push
if [ ! -f ".seeded" ]; then
  npm run db:seed
  touch .seeded
fi
npm run helper:build

# 5. Start and open the browser
echo ""
echo "Starting AILI. Leave this window open. Press Ctrl+C to stop."
(sleep 6 && open "http://localhost:3000") &
npm run dev
