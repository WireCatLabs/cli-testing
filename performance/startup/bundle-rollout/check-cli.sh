#!/usr/bin/env bash
# usage: check-cli.sh <name> <repo> <command> <commands file> "<mcp args>" <cli-dev bundle args...>
# Packs before (tsc) and after (bundle), installs both under npm and pnpm, runs the commands, an MCP session and the
# asset probe against each, and compares before with after per layout. OUT= sets where results go.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
name=$1 repo=$2 cmd=$3 cmds=$4 mcp=$5; shift 5
out=${OUT:-$HERE/work/results}/$name
"$HERE/pack.sh" "$repo" "$out" "$@" >/dev/null 2>&1 || { echo "$name: pack failed"; exit 1; }
for v in before after; do
  rm -rf "$out/$v"
  # shellcheck disable=SC2086
  "$HERE/installed.sh" "$out/$v" "$out/$v.tgz" "$cmd" "$HERE/$cmds" $mcp 2>&1 | grep -v "^npm: /\|^pnpm: /" | sed "s/^/$name $v /"
done
for layout in npm pnpm; do
  echo "$name $layout: $("$HERE/compare.sh" "$out/before/$layout" "$out/after/$layout" | grep '^DIFF\|^compared\|REFUSED' | tr '\n' ' ')"
done
