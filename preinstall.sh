#!/bin/sh
set -e

cd "$(dirname "$0")"

if [ ! -d .patricktree-stack ] || [ -z "$(ls -A .patricktree-stack)" ]; then
    echo "The .patricktree-stack submodule is missing or empty." >&2
    echo "Run git submodule update --init --recursive, then retry pnpm install." >&2
    exit 1
fi
