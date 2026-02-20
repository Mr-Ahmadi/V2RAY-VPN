# V2Ray VPN

Desktop V2Ray client built with Electron + React.

It provides server management, connection monitoring, proxy mode control, per-app routing policies, and GitHub-based update checks from inside Settings.

![V2Ray VPN Client Screenshot](Screenshot.png)

## Features

- Supported protocols: VLESS, VMess, Trojan, Shadowsocks
- Supported transports: TCP, WebSocket, gRPC
- Real-time stats: up/down speed, totals, ping, duration
- DNS controls: Cloudflare, Google, Quad9, OpenDNS, custom DNS
- Security toggles: kill switch, IPv6 disable, ad/tracker blocking
- Proxy modes: Global, Per-app, PAC
- App policies: Follow Global, Bypass VPN, Use VPN
- Routing diagnostics and capability-aware policy enforcement
- In-app GitHub release check and update download flow

## Tech Stack

- Electron (main process + desktop packaging)
- React + Material UI (renderer)
- TypeScript
- electron-builder

## Project Structure

```text
src/
├── main/        Electron main process (window, IPC, platform integration)
├── renderer/    React UI
├── services/    V2Ray control, proxy manager, routing manager
├── db/          storage abstraction
└── types/       preload/renderer shared types
```

## Requirements

- Node.js 18+
- npm 9+
- macOS/Windows/Linux
- V2Ray core binaries available in `v2ray-core/`

## Environment Variables

Create `.env` from `.env.example` if needed.

```env
SKIP_PREFLIGHT_CHECK=true
TSC_COMPILE_ON_ERROR=false
NODE_ENV=development
V2RAY_API_PORT=10085
APP_NAME=V2Ray VPN
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Ensure `v2ray-core` exists and includes an executable `v2ray` binary.

You can use the helper script:

```bash
chmod +x setup.sh && ./setup.sh
```

## Development

Run the app in development mode:

```bash
npm run dev
```

This starts the React dev server and Electron process together.

## Build

Build renderer + main process:

```bash
npm run build
```

Create distributables locally (no publish):

```bash
npm run dist
```

## Publish to GitHub Releases

Publish artifacts with electron-builder:

```bash
GH_TOKEN=your_github_token npm run dist:github
```

Important:

- Use a token with proper repository release permissions.
- Do not commit or share `GH_TOKEN` values.
- Artifacts are generated with this naming pattern:
  - `V2Ray-VPN-${version}-${arch}.${ext}`

## App Usage Flow

1. Add/import server config in **Servers**.
2. Connect from **Connection Bar**.
3. Configure proxy mode in **Settings**.
4. Manage app policies in **Routing**.
5. Apply routing changes when needed.

## Proxy Modes

### Global

- System proxy enabled
- Default route is VPN
- Use app policy **Bypass VPN** for selected direct apps

### Per-app

- System proxy disabled
- Default route is direct
- Use app policy **Use VPN** for selected apps that support forced proxy launch

### PAC

- Auto-proxy enabled
- Default route is VPN through PAC rules
- Per-app behavior depends on platform/application capability

## In-App GitHub Update Configuration

Defaults in Settings:

- Owner: `Mr-Ahmadi`
- Repository: `V2RAY-VPN`

If you publish from another repository, update these values in Settings.

## Troubleshooting

- Verify `v2ray-core/v2ray` exists and is executable.
- Verify server credentials and transport settings.
- For per-app mode, confirm selected apps support enforced proxy launch.
- Use in-app routing diagnostics for system-level behavior checks.

### macOS: “V2Ray VPN is damaged and can’t be opened”

This is usually Gatekeeper quarantine for downloaded unsigned/unnotarized builds.

Unquarantine installed app:

```bash
find "/Applications/V2Ray VPN.app" -exec xattr -d com.apple.quarantine {} \; 2>/dev/null
```

Unquarantine downloaded installer (before install), example:

```bash
xattr -d com.apple.quarantine ~/Downloads/V2Ray-VPN-0.1.0-beta.1-arm64.dmg
```

For public distribution, proper fix is Apple Developer ID signing + notarization.

## Diagnostics Script

Run system checks on macOS:

```bash
chmod +x diagnose.sh && ./diagnose.sh
```

## License

MIT
