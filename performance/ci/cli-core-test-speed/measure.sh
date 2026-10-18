#!/usr/bin/env bash
# Times cli-core's vitest suite in several configurations, on 4 pinned cores to approximate a 4-vCPU runner.
#   measure.sh <cli-core checkout> <output dir> [run...]
# Runs: w1 w2 w4 (workers), cov (coverage, 4 workers), shm (TMPDIR on tmpfs), noiso (isolate off)
set -euo pipefail
repo=$1 out=$2; shift 2
runs=${*:-w1 w2 w4 cov shm noiso}
mkdir -p "$out"
cd "$repo"
pin=(taskset -c 0-3)
for run in $runs; do
  args=(npx vitest run --maxWorkers=4) env=()
  case $run in
    w1) args=(npx vitest run --maxWorkers=1) ;;
    w2) args=(npx vitest run --maxWorkers=2) ;;
    w4) ;;
    cov) args+=(--coverage) ;;
    shm) d=$(mktemp -d /dev/shm/cli-core-bench-XXXX); env=(TMPDIR="$d") ;;
    noiso) args+=(--no-isolate) ;;
  esac
  load=$(cut -d' ' -f1 /proc/loadavg)
  start=$(date +%s.%N)
  env "${env[@]}" "${pin[@]}" "${args[@]}" > "$out/$run.log" 2>&1 && status=ok || status=failed
  wall=$(echo "$(date +%s.%N) - $start" | bc)
  summary=$(grep -E "Test Files" "$out/$run.log" | tail -1 | sed 's/\x1b\[[0-9;]*m//g' | xargs || true)
  refused=$(grep -c "a test tried to reach" "$out/$run.log" || true)
  printf '%s\twall=%.1fs\tload=%s\t%s\tnetwork-refusals=%s\t%s\n' "$run" "$wall" "$load" "$status" "$refused" "$summary" | tee -a "$out/summary.tsv"
  if [ "$run" = shm ]; then rm -rf "$d"; fi
done
