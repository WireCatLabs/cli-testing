#!/bin/sh
# Sandboxed OpenClaw rerun for post 1: one lane at a time, owner-path scan after each.
cd /var/tmp/locomo-bench/harness || exit 1
export OC_ISO_BASE=/var/tmp/locomo-bench/oc-base OC_ISO_UPPER=/var/tmp/locomo-bench/oc-iso2
lane() {
  echo "lane: $*"
  python3 driver.py --stage full-iso2 --agent openclaw "$@" || { echo "lane exit $?"; exit 1; }
  hits=$(python3 /var/tmp/locomo-bench/scripts/iso_owner_check.py)
  echo "owner hits: $hits"
  [ "$hits" = 0 ] || { echo "STOP: owner paths in tool calls"; exit 3; }
}
STRONG=$(cat /var/tmp/locomo-bench/strong-subset-ids.txt)
for run in w1 w2 w3; do
  lane --setup wirecat --model deepseek-flash --run $run --questions all
  lane --setup files --model deepseek-flash --run $run --questions all
done
lane --setup wirecat --model deepseek-v4-pro --run s1 --questions "$STRONG"
lane --setup files --model deepseek-v4-pro --run s1 --questions "$STRONG"
echo "all lanes done"
