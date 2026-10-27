#!/usr/bin/env bash
# install.sh <repo dir> <dest dir> — npm pack --ignore-scripts the built repo, install the tarball into <dest>/prefix.
set -eu
repo=$1; dest=$2
mkdir -p "$dest"
tarball=$(cd "$repo" && npm pack --ignore-scripts --pack-destination "$dest" 2>/dev/null | tail -1)
HOME=$dest/npmhome npm_config_cache=${NPM_CACHE:-$dest/npmcache} npm install -g --prefix "$dest/prefix" "$dest/$tarball" --no-audit --no-fund >/dev/null 2>&1
echo "$dest/$tarball"
