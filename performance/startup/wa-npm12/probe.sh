#!/bin/sh
set -eu
probe_root=$(mktemp -d /tmp/wa-npm12.XXXXXX)
mkdir -p "$probe_root/state" "$probe_root/config" "$probe_root/cache"
export XDG_STATE_HOME="$probe_root/state" XDG_CONFIG_HOME="$probe_root/config" XDG_CACHE_HOME="$probe_root/cache"
unset WA_INSTALL_AGENT
npm --userconfig /dev/null exec --yes --package=npm@12.2.1 -- npm --version > "$probe_root/version.txt"
for mode in blocked allowed; do
 if [ "$mode" = allowed ]; then policy=--allow-scripts=@wirecat/whatsapp-cli; else policy=; fi
 npm --userconfig /dev/null exec --yes --package=npm@12.2.1 -- npm install --global --prefix "$probe_root/$mode" --userconfig /dev/null --cache "$probe_root/npm-cache" --no-audit --no-fund --foreground-scripts $policy @wirecat/whatsapp-cli@0.6.0 > "$probe_root/$mode.log" 2>&1
 "$probe_root/$mode/bin/wa" --version > "$probe_root/$mode-version.txt"
done
printf '%s\n' "Evidence: $probe_root"
cat "$probe_root/version.txt" "$probe_root/blocked-version.txt" "$probe_root/allowed-version.txt"
rg 'install-scripts|postinstall|agent skill not installed' "$probe_root/blocked.log" "$probe_root/allowed.log"
