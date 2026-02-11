# V2Ray VPN

A modern, high-performance desktop VPN client for V2Ray, built with **Electron**, **React**, and **TypeScript**. V2Ray VPN offers a premium user experience with advanced features like per-app routing and real-time connection monitoring.

---

## ✨ Key Features

- 🌐 **Protocol Support**: VLESS, Vmess, Trojan, and Shadowsocks.
- 🛣️ **Per-App Routing**: Granular control over which applications use the VPN tunnel.
- ⚡ **Real-time Monitoring**: Live upload/download speeds and connection stability tracking.
- 📋 **Easy Import**: Support for importing servers via sharing links (`vless://`, `vmess://`, etc.).
- 🛠️ **Advanced Settings**: DNS customization, auto-connect, and security options.
- 🎨 **Modern UI**: Clean, responsive interface built with Material UI.
- 💻 **Cross-Platform**: Native support for macOS, Windows, and Linux.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v16 or higher
- **npm**: v8 or higher
- **V2Ray Core**: The app expects the V2Ray core binary in the `v2ray-core/` directory.

### Quick Start

1.  **Clone the Repository**
    ```bash
    git clone <your-repo-url>
    cd v2ray
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Setup V2Ray Core**
    Download the appropriate [V2Ray Core](https://github.com/v2fly/v2ray-core/releases) for your OS and place it in a `v2ray-core` directory at the project root.
    ```bash
    mkdir -p v2ray-core
    # Move v2ray binary to v2ray-core/
    ```

4.  **Run in Development**
    ```bash
    npm run dev
    ```

---

## 🛠️ Project Structure

The codebase is structured for scalability and clarity:

```text
v2ray/
├── src/
│   ├── main/           # Electron main process (System interaction)
│   ├── renderer/       # React frontend (UI components)
│   ├── services/       # Core business logic (VPN, Routing, Server Mgmt)
│   ├── db/             # Data persistence (SQLite)
│   └── utils/          # Shared utilities
├── public/             # Static assets
└── v2ray-core/         # V2Ray binaries (User-managed)
```

---

## 📦 Building & Distribution

Build the production-ready application for your current platform:

```bash
# Build React and compile TypeScript
npm run build

# Package the application for distribution
npm run dist
```

Generated installers (DMG, EXE, AppImage) will be located in the `dist/` directory.

---

## 📖 Usage Guide

- **Importing Servers**: Click the "Import URI" button and paste your server link.
- **Connecting**: Choose a server from the "Status" tab and click "Connect".
- **App Routing**: Use the "App Routing" tab to toggle VPN usage for specific installed applications.
- **Settings**: Adjust DNS, connection timeouts, and auto-start preferences in the "Settings" tab.

---

## ⚠️ Troubleshooting

- **Core Not Found**: Ensure the V2Ray binary is executable (`chmod +x v2ray-core/v2ray` on Unix).
- **macOS Permissions**: configuring system proxy requires administrator privileges. The app will prompt for credentials when necessary.
- **Connection Issues**: Verify server details and your local firewall settings.

---