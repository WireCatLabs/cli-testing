# WhatsApp global install hooks on npm 12

The WhatsApp launch review found that npm warned about its optional postinstall hook. This check asks whether
npm 12 still runs it, and which scoped approval lets the documented `WA_INSTALL_AGENT` entrypoint execute.
It supports adding the approval flag and a manual skill-install alternative to the installation guide.

## Setup

Run on 2026-10-24, Linux x64, Node.js 24.19.0, npm 12.2.1, published `@wirecat/whatsapp-cli` 0.6.0.
[probe.sh](probe.sh) pins npm and the CLI, installs each into its own temporary prefix, redirects XDG paths,
and runs no account command. It leaves the evidence directory in place and prints its path.
`WA_INSTALL_AGENT` is unset: the probe checks hook execution without changing any agent's folders.

```sh
sh performance/startup/wa-npm12/probe.sh
```

The script needs Node.js, npm, ripgrep and registry access. Both installs use `--foreground-scripts` to expose
whether the hook ran; one also uses `--allow-scripts=@wirecat/whatsapp-cli`.

## Result

| Global install policy | Install exit | Hook | `wa --version` |
|---|---|---|---|
| Default | 0 | Blocked; `npm warn install-scripts` says the package is not covered by `allowScripts` | `0.6.0`, exit 0 |
| Scoped approval for `@wirecat/whatsapp-cli` | 0 | Ran `node install/postinstall.mjs`; printed the manual skill-install guidance | `0.6.0`, exit 0 |

The CLI remains usable when the hook is blocked. An opt-in variable cannot make npm execute a blocked hook;
the global install needs the scoped approval first. A person can also leave install hooks blocked and run
`wa skill install` explicitly after installing.

This agrees with [npm's global-install policy](https://docs.npmjs.com/cli/v12/commands/npm-install/#allow-scripts).
It does not measure performance, actual writes into an agent's folder, project-scoped installs, other operating
systems or any WhatsApp behavior. No account was linked or used.
