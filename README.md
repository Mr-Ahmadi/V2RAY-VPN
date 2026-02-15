# V2Ray VPN Client

A full-featured V2Ray VPN client for macOS with system-wide proxy support, similar to V2Box and V2RayNG.

## ✨ Features

- ✅ **Full VPN functionality** - routes all system traffic through the proxy
- ✅ **DNS Leak Prevention** - all DNS queries routed through VPN tunnel
- ✅ **Protocol Support**: VLESS, VMess, Trojan, and Shadowsocks
- ✅ **Transport Support**: WebSocket, gRPC, and TCP
- ✅ **System Proxy Integration**: HTTP, HTTPS, SOCKS5
- ✅ **Real-time Statistics**: Speed, data usage, and ping monitoring
- ✅ **URI Import**: Import servers from vless://, vmess://, trojan://, ss:// links
- ✅ **Per-app Routing**: Route specific applications through the proxy
- ✅ **Ad Blocking**: Built-in ad and malware protection
- ✅ **DNS Protection**: Prevents DNS leaks with secure DNS providers
- ✅ **Kill Switch**: Blocks internet if VPN disconnects (optional) - *in progress*
- ✅ **Multiple Routing Modes**: Full VPN, Per-App, PAC, Bypass, Rule-based
- ✅ **Custom DNS**: Cloudflare, Google, Quad9, OpenDNS, or custom servers

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Download V2Ray Core

```bash
chmod +x setup.sh && ./setup.sh
```

Or manually download from: https://github.com/v2fly/v2ray-core/releases

### 3. Run in Development Mode

```bash
npm run dev
```

### 4. Build for Production

```bash
npm run build
npm run dist
```

---

## 📖 How to Use

### Adding a Server

1. Click **"Add Server"** button
2. Choose one of the following methods:
   - **Import from URI**: Paste your vless://, vmess://, trojan://, or ss:// URI
   - **Manual Configuration**: Fill in server details manually

**Example VLESS URI:**
```
vless://uuid@server.com:443?type=ws&path=/&security=tls&sni=server.com#MyServer
```

### Connecting to VPN

1. Select a server from the list
2. Click **"Connect"** button
3. Grant system proxy permissions when prompted (requires admin password)
4. ✅ All system traffic will now route through the VPN

### Monitoring Connection

Once connected, you'll see:
- 📊 Upload/Download speed in Mbps
- 📈 Total data transferred
- 🏓 Connection ping/latency
- ⏱️ Connection duration

### Disconnecting

Click **"Disconnect"** button to stop the VPN and restore normal network settings.

---

## ⚙️ Configuration

### Routing Modes

- **Full VPN Mode** (Default): Routes all traffic through the proxy, just like V2Box/V2RayNG
  - All DNS queries routed through VPN
  - Only localhost bypassed
  - Prevents DNS leaks
- **Per-App Mode**: Launch specific applications with proxy environment variables
  - Use "Launch with Proxy" button in App Routing tab
  - Apps inherit proxy settings
- **PAC Mode**: Proxy Auto-Configuration file
  - Automatic proxy selection based on URL patterns
- **Bypass Mode**: Route selected apps directly (bypass VPN)
  - Configure in App Routing tab
- **Rule-Based Mode**: Custom routing rules
  - Advanced users can define specific routing logic

### DNS Configuration

The app supports multiple secure DNS providers to prevent DNS leaks:
- **Cloudflare (1.1.1.1)**: Fast and privacy-focused (default)
- **Google (8.8.8.8)**: Reliable and widely available
- **Quad9 (9.9.9.9)**: Security and privacy focused
- **OpenDNS (208.67.222.222)**: Family-safe filtering
- **Custom**: Use your own DNS servers

All DNS queries are routed through the VPN tunnel to prevent leaks.

### Security Features

- **Kill Switch**: Blocks all internet traffic if VPN disconnects (optional)
- **DNS Leak Prevention**: All DNS queries routed through VPN
- **Ad Blocking**: Blocks ads and trackers using V2Ray's built-in rules
- **IPv6 Leak Prevention**: Option to disable IPv6 if server doesn't support it

### Proxy Ports

- **SOCKS5**: 127.0.0.1:10808
- **HTTP/HTTPS**: 127.0.0.1:10809

---

## 🛠️ Project Structure

```
src/
├── main/           # Electron main process
├── renderer/       # React UI components
├── services/       # Core services (V2Ray, proxy, routing)
├── db/            # SQLite database
└── types/         # TypeScript definitions
```

### Key Services

- **V2RayService**: Manages V2Ray process and configuration
- **SystemProxyManager**: Handles macOS system proxy settings
- **ServerManager**: Server CRUD operations
- **AppRoutingService**: Per-app routing functionality

---

## 🐛 Troubleshooting

### VPN connects but no internet traffic

**This issue has been fixed!** The app now properly routes all traffic through the VPN tunnel.

If you still experience issues:
1. Check if V2Ray core is running: `ps aux | grep v2ray`
2. Verify system proxy is enabled: System Preferences → Network → Advanced → Proxies
3. Check V2Ray logs in the app console
4. Try disconnecting and reconnecting
5. Test DNS leak: Visit https://dnsleaktest.com/
6. Check your IP: Visit https://whatismyipaddress.com/

### DNS Leaks

**Fixed!** All DNS queries are now routed through the VPN tunnel:
- DNS `domainStrategy` set to `IPIfNonMatch`
- DNS outbound protocol configured
- Secure DNS providers (Cloudflare, Google, Quad9, OpenDNS)
- Test at https://dnsleaktest.com/

### Permission errors

The app needs administrator privileges to configure system proxy settings. You'll be prompted for your password when connecting.

### Stats showing 0.00 Mb/s

Stats are calculated based on active connections. Try:
1. Open a web browser and visit a website
2. Wait a few seconds for stats to update
3. Stats update every second

### Server connection fails

1. Verify server details are correct
2. Check if the server is online
3. Try testing the server with "Ping" button
4. Check firewall settings

---

## 🔧 Technical Details

### V2Ray Configuration

The app generates optimized V2Ray configurations with:
- **DNS Leak Prevention**: All DNS queries routed through proxy with `IPIfNonMatch` strategy
- **Secure DNS**: Configurable DNS providers (Cloudflare, Google, Quad9, OpenDNS, Custom)
- **Traffic sniffing**: Better routing decisions based on traffic type
- **Ad blocking**: Optional blocking of ads and trackers (geosite:category-ads-all)
- **Minimal bypass**: Only localhost bypassed (127.0.0.0/8)
- **Multiplexing**: Better performance when supported by protocol
- **Stats API**: Real-time upload/download speed tracking

### Routing Logic

V2Ray routing rules are processed top-to-bottom, first match wins:
1. **Localhost bypass** (127.0.0.0/8) - prevents routing loops
2. **Ad blocking** (optional) - blocks ads and trackers
3. **Default to proxy** - all other traffic routed through VPN

This ensures ALL traffic (except localhost) goes through the VPN tunnel.

### System Integration

- Automatically configures macOS system proxy settings
- SOCKS5 proxy on 127.0.0.1:10808 (primary, handles all traffic types)
- HTTP/HTTPS proxy on 127.0.0.1:10809 (web traffic)
- Minimal bypass list: only "127.0.0.1,localhost"
- Properly cleans up on disconnect
- Handles app quit gracefully

### Why Traffic Now Routes Correctly

**Previous Issues:**
1. DNS `domainStrategy` was `AsIs` - didn't force DNS through proxy
2. No DNS outbound protocol - DNS queries leaked
3. Incomplete routing rules - traffic could bypass VPN
4. System proxy order - HTTP/HTTPS before SOCKS

**Fixes Applied:**
1. Changed to `IPIfNonMatch` - forces domain resolution through proxy DNS
2. Added DNS outbound with `protocol: 'dns'`
3. Simplified routing: only bypass localhost, everything else to proxy
4. Enable SOCKS first (most universal), then HTTP/HTTPS

See `FIXES_APPLIED.md` for detailed technical explanation.

---

## 📝 License

MIT

## 🙏 Credits

- [V2Ray Core](https://github.com/v2fly/v2ray-core)
- [Electron](https://www.electronjs.org/)
- [React](https://reactjs.org/)
- [Material-UI](https://mui.com/)
