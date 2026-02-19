# V2Ray VPN Client

Desktop V2Ray client built with Electron + React.

It provides server management, connection monitoring, proxy mode control, app-level routing policies, and GitHub-based update checks from inside Settings.

![V2Ray VPN Client Screenshot](Screenshot.png)

## Features

- V2Ray protocols: VLESS, VMess, Trojan, Shadowsocks
- Transport types: TCP, WebSocket, gRPC
- Real-time connection stats: up/down speed, totals, ping, duration
- DNS provider control: Cloudflare, Google, Quad9, OpenDNS, custom
- Security toggles: kill switch, IPv6 disable, ad/tracker blocking
- Proxy modes: Global, Per-app, PAC
- App routing policies: Follow Global, Bypass VPN, Use VPN
- Routing diagnostics and capability-aware policy enforcement
- Custom title bar with app-themed window controls
- Build and update section in Settings with GitHub release checks

## Project Structure

```text
src/
├── main/        Electron main process (window, IPC, system integration)
├── renderer/    React UI
├── services/    V2Ray, proxy manager, app routing, routing manager
├── db/          storage abstraction
└── types/       preload/renderer TypeScript types
```

## Requirements

- Node.js 18+
- npm 9+
- macOS/Windows/Linux for desktop runtime
- V2Ray core binaries (included in `v2ray-core/` or downloaded via `setup.sh`)

## Development

Install dependencies:

```bash
npm install
```

Run app in development mode:

```bash
npm run dev
```

## Build

Build renderer + main process:

```bash
npm run build
```

Create distributables with Electron Builder:

```bash
npm run dist
```

Publish distributables to GitHub Releases (downloadable by users):

```bash
GH_TOKEN=your_github_token npm run dist:github
```

## Main App Flow

1. Add/import server config in **Servers** tab.
2. Connect from the connection bar.
3. Choose proxy behavior in **Settings**.
4. Manage app policies in **Routing**.
5. Apply app routing immediately with **Apply Now** when needed.
6. Disconnect to stop VPN and cleanup proxy state.

## Proxy Modes

### Global

- System proxy enabled.
- Default route is VPN.
- Use app policy **Bypass VPN** for selected direct apps.

### Per-app

- System proxy stays disabled.
- Default route is direct.
- Use app policy **Use VPN** for selected apps that support proxy-forced launch.

### PAC

- Auto-proxy (PAC) enabled.
- Default route is VPN via PAC rules.
- Per-app direct behavior depends on app capability and PAC/system behavior.

## App Routing Policies

- **Follow Global**: no explicit app override, app follows current proxy mode default.
- **Bypass VPN**: relaunch app in direct mode when enforceable.
- **Use VPN**: relaunch app with proxy args/env when enforceable.

The app surfaces capability constraints (for example engine/platform-specific limitations) in the UI and routing diagnostics.

## Settings Overview

- Connection: auto-connect, reconnect on disconnect, ping display
- DNS: provider selection + custom DNS support
- Security: kill switch, IPv6 disable
- Network: allow insecure, timeout, proxy mode
- Privacy: anonymous usage-data toggle
- Builds & Updates:
  - Current app version/platform/electron info
  - GitHub owner/repo fields
  - **Check for Updates** (reads latest release from GitHub API)
  - **Update from GitHub** (downloads platform installer from latest release and opens it)

## GitHub Update Configuration

Default repository values in Settings:

- Owner: `Mr-Ahmadi`
- Repository: `V2RAY-VPN`

Change these fields if you publish builds from a different repository.

To publish downloadable builds for the in-app updater:

1. Create a GitHub release or run `GH_TOKEN=... npm run dist:github`.
2. Ensure release assets contain platform installers (`.dmg`/`.exe`/`.AppImage` etc).
3. In Settings, keep owner/repo pointed to that repository.

## Troubleshooting

- Ensure V2Ray core is present and executable.
- Verify server credentials/transport settings.
- For per-app mode, confirm selected app supports forced proxy routing.
- For system-level behavior checks, use Routing diagnostics in-app.

## License

MIT
