# wirecat-funnel: is Tailscale's log upload really off?

## Why

WireCat Desktop is getting a way to publish an MCP server through Tailscale Funnel without an administrator
password: `wirecat-funnel`, a small helper built on Tailscale's `tsnet` library
([funnel-cli](https://github.com/WireCatLabs/funnel-cli)). The owner decided that Tailscale's log upload stays off
in it. Tailscale uploads logs by default, and Tailscale's own advice is the `TS_NO_LOGS_NO_SUPPORT` setting.

Reading `tsnet` at v1.104.5 showed that it never checks that setting itself (`tsnet/tsnet.go:1100-1137` always
starts the log uploader). The setting only works through the uploader's network transport, which sends nothing when
it is on (`logpolicy/logpolicy.go:894-897`). The helper therefore calls `envknob.SetNoLogsNoSupport()` and
`logtail.Disable()` first thing in `main`. Go tests cannot check this, because `tsnet` skips the logger entirely
under `go test`. The question was: does the built binary contact Tailscale's log server or write logs? The answer
goes into the privacy texts.

## Setup

- Linux x86_64, funnel-cli at its first PR (`feat/helper`), `tailscale.com` v1.104.5, Go 1.27.3,
  `CGO_ENABLED=0 go build -trimpath -ldflags "-s -w"`.
- State in a temporary folder, no Tailscale login: the helper runs until it shows the login link.
- `GODEBUG=netdns=go+2` makes Go print every host name it looks up. `ss -tnp` lists the process's TCP connections,
  six samples 5 s apart.
- Command: `performance/funnel/logs-off/measure.sh /path/to/funnel-cli`.

There was no run without the switch for comparison: that run would upload real logs, which is exactly what was
decided against.

## Results (2026-11-05)

```text
binary: 22364320 bytes, go1.26.5, Linux x86_64
state after start: needs-login, 1.28 s
connection:       6 [2606:b740:49::112]:80
lookup:       1 hostLookupOrder(controlplane.tailscale.com)
log.tailscale.com resolves to: 199.165.136.101 2606:b740:1:20::102
file: control.json 600 103
file: run.log 600 167
file: tailscaled.log1.txt 600 0
file: tailscaled.log2.txt 600 0
file: tailscaled.log.conf 600 209
file: tailscaled.state 600 119
stopped
```

The run printed `go1.26.5`, the Go on PATH outside the repository. The build itself used the module's toolchain,
go1.27.3. The script now asks Go inside the repository. A first run on 2026-11-03 gave the same picture, with one connection to `[2606:b740:49::116]:80`.

## What it showed

- The only name the helper looked up in 30 s was `controlplane.tailscale.com`. Its one connection went to the
  control server, not to an address of `log.tailscale.com`.
- Tailscale's log buffers (`tailscaled.log1.txt`, `tailscaled.log2.txt`) stayed empty. `tailscaled.log.conf` is
  still written, with a random private log id. It never leaves the computer, and the privacy texts say so.
- Every file is mode 600, and the folder is 700.
- The helper reached the login link in 1.3 s. The linux-x64 binary is 22.4 MB, 8.9 MB as an npm tarball.

## Not measured

- A logged-in node here. The owner's live check covered it on 2026-11-05: 0 lookups of `log.tailscale.com`
  ([live-check](../live-check/README.md)).
- UDP traffic, such as STUN or DERP, which is not a log path. Lookups that bypass Go's resolver, for example
  Tailscale's bootstrap DNS by fixed IP. These are not on the log path either, because the log transport sends
  nothing.
- macOS, Windows and arm64.
