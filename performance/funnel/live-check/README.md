# wirecat-funnel: Funnel end to end on a temporary device

## Why

The [logs-off measurement](../logs-off/README.md) checked the helper only up to the Tailscale login link. Three
questions needed a real login, which only the owner could do:

- Does Funnel work from the public internet through a `tsnet` device in userspace, with no administrator rights?
- Does an ephemeral `tsnet` device (state in memory) accept a login in the browser? Tailscale documents ephemeral
  devices as made with auth keys, so this was open.
- Does the helper stay away from Tailscale's log server once it is logged in?

The answers decided whether WireCat Desktop ships the helper (it does, in 0.4.0) and whether the privacy texts can
say that log upload is off.

## Method

`bin/live-check` in [funnel-cli](https://github.com/WireCatLabs/funnel-cli/blob/main/docs/TESTING.md), run once by
the owner on 2026-11-05 on Linux x86_64, funnel-cli `main` at 4cff35c (`tailscale.com` v1.104.5, Go 1.27.3):

1. A dummy MCP endpoint on `127.0.0.1` answers `initialize`.
2. The helper runs with `--ephemeral --funnel-only --hostname wirecat-check`, so it answers only connections that
   arrive through Funnel, and `GODEBUG=netdns=go+2`, so every host name it looks up is printed.
3. The owner signs in in the browser.
4. The script resolves the public name through `dig @1.1.1.1` and calls `https://<name>/mcp` with `curl --resolve`,
   every 15 s for up to 10 minutes. This keeps the request off the tailnet path of the system Tailscale on the same
   computer.
5. It counts the helper's lookups of `log.tailscale.com`, then stops the helper, which logs the device out.

## Results

| Question | Result |
| --- | --- |
| Interactive login of an ephemeral `tsnet` device | worked |
| Call through public DNS to the dummy server | PASS on the 4th try |
| First 3 tries | failed on TLS and a timeout while the HTTPS certificate was issued |
| Lookups of `log.tailscale.com` while logged in | 0 |

The tailnet name, the device address and the login link are not recorded here.

## What it showed

- Funnel works with no administrator rights and no Tailscale app, through a userspace `tsnet` device on port 443.
- An ephemeral device takes a browser login, so the live check needs no auth key.
- Log upload stays off when the device is logged in, the state the privacy texts describe.
- The first call after start can fail while the certificate is issued. Desktop has to wait and retry, not report a
  failure on the first error.

## Not measured

- How long the certificate took, in seconds. The script printed tries, not times.
- macOS and Windows, a non-ephemeral device across restarts, and key expiry.
- UDP traffic and Tailscale's bootstrap DNS by fixed IP, which do not go through Go's resolver.
