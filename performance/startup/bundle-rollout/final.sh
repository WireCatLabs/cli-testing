#!/usr/bin/env bash
# final.sh <name> <cmd> <main worktree> <bundle worktree> <profile|-> <cli-dev bundle args...>
set -u
name=$1 cmd=$2 mainwt=$3 bwt=$4 profile=$5; shift 5
D=$(cd "$(dirname "$0")" && pwd)
S=${WORK_ROOT:-$(dirname "$0")/work}
out=$S/final/$name; rm -rf $out; mkdir -p $out
export WORK=$S/work NPM_CACHE=$S/npmcache PNPM_STORE=$S/pnpm-store
pk() { (cd "$1" && [ "$(git rev-parse --show-toplevel)" = "$1" ] && corepack pnpm build >/dev/null 2>&1 && f=$(npm pack --ignore-scripts --pack-destination $out 2>/dev/null | tail -1) && mv $out/$f $out/$2.tgz) || echo "$name: pack $2 failed"; }
(cd $mainwt && git fetch -q origin && git checkout -q --detach origin/main && corepack pnpm install --frozen-lockfile >/dev/null 2>&1)
pk $mainwt before; pk $bwt after
echo "$name sizes: before $(stat -c %s $out/before.tgz) after $(stat -c %s $out/after.tgz)"
mcp="mcp serve"; [ "$profile" = - ] || mcp="$profile mcp serve"
for v in before after; do $D/installed.sh $out/$v $out/$v.tgz $cmd $D/commands-$name.txt $mcp 2>&1 | grep -v "^npm: /\|^pnpm: /" | sed "s/^/$name $v /"; done
for l in npm pnpm; do echo "$name identity $l: $($D/compare.sh $out/before/$l $out/after/$l | grep '^DIFF\|^compared\|REFUSED' | tr '\n' ' ')"; done
# A: the bundle branch's build. B: the next patch version, every chunk renamed, built by a copy of bundle.js
# (never edit node_modules: pnpm's files are hardlinks into the shared store).
cp $out/after.tgz $out/A.tgz
(cd $bwt && [ "$(git rev-parse --show-toplevel)" = "$bwt" ] || exit 1
 mkdir -p .bundle-b && sed 's/chunkNames: "\[name\]-\[hash\]"/chunkNames: "[name]-b-[hash]"/' node_modules/@wirecat/cli-base/dist/dev/bundle.js > .bundle-b/bundle.mjs
 cp package.json .bundle-b/package.json.orig
 node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json"));p.version=p.version.replace(/\d+$/,n=>+n+1);fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
 npx tsc --build --force >/dev/null 2>&1
 node --input-type=module -e "const {bundle}=await import(process.cwd()+'/.bundle-b/bundle.mjs'); const a=JSON.parse(process.argv[1]); const r=await bundle({root:process.cwd(),bin:a.bin,external:a.external,anchored:[],harmless:[]}); if(r.problems.length){console.error(r.problems.join('\n'));process.exit(1)}" "$BUNDLE_JSON"
 f=$(npm pack --ignore-scripts --pack-destination $out 2>/dev/null | tail -1); mv $out/$f $out/B.tgz
 cp .bundle-b/package.json.orig package.json; rm -rf .bundle-b; corepack pnpm build >/dev/null 2>&1)
echo "$name A/B: $(tar tzf $out/A.tgz | grep -c dist/bundle/) / $(tar tzf $out/B.tgz | grep -c dist/bundle/) bundle files, shared names: $(comm -12 <(tar tzf $out/A.tgz | grep dist/bundle/ | sort) <(tar tzf $out/B.tgz | grep dist/bundle/ | sort) | wc -l)"
for m in "mcp serve" "${FLAG:---quiet} mcp serve"; do
  tag=plain; [ "$m" = "mcp serve" ] || tag=flag
  MCP="$m" WORK=$S/upgrade-final $D/upgrade.sh $name-$tag $cmd $profile $out/A.tgz $out/B.tgz $D/reads-$name.json > $out/upgrade-$tag.log 2>&1
  echo "$name upgrade ($m): $(grep -A1 verdict $out/upgrade-$tag.log | tail -1) | bundle loads before the upgrade: $(grep -c '/dist/bundle/' $S/upgrade-final/runs/$name-$tag/loads.log 2>/dev/null)"
done
for v in before after; do HOME=$out/$v-bench/h npm_config_cache=$S/npmcache npm install -g --prefix $out/$v-bench/prefix $out/$v.tgz --no-audit --no-fund >/dev/null 2>&1; done
echo "== $name $(uptime)" > $out/bench.txt
node $D/bench.mjs 10 $D/bench-$name.json $out/before-bench/prefix/bin/$cmd $out/after-bench/prefix/bin/$cmd 2>$out/rounds.txt >> $out/bench.txt
grep -v "^warm\|^cold" $out/bench.txt; grep "^warm" $out/bench.txt | sed "s/^/$name /"
