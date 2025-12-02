# VPOS / DOMS Machine Dashboard

A tiny, low-resource dashboard for a BusyBox/Linux device that exposes basic machine stats and renders them in a lightweight HTML/CSS/JS UI.

- **Backend:** Node.js + TypeScript (no frameworks)
- **Frontend:** Static `index.html` + `styles.css` + plain `app.js` (no bundler)
- **Designed for:** minimal devices (limited tooling)

## Features

- Hostname + “last updated” timestamp
- Memory usage (from `free -m`)
- CPU usage (from `/proc/stat`)
- Load averages (from `uptime`)
- Temperature sensors (from `/sys/class/thermal/thermal_zone*/`)
- Disk usage (from `df -k`)
  - Prefers `/media/appfs` (treated as the main/total accessible storage)
- Top processes by memory (BusyBox `ps`, sorted by VSZ)
- Tracked directory usage:
  - Lists **subfolders under** `/opt/fccapps/vpos-perm` and shows their size (via `du -sk`)
  - Click a folder “chip” to show its percentage of `/media/appfs`
- Interactive directory inspection:
  - `/api/dir-usage?path=...` for any directory under `/opt/fccapps` or `/media/appfs`
- **Refresh button** (manual update)
- **Auto refresh:** once per hour (configurable)
- Theme + density switches (stored in localStorage)
---

## Requirements

- Node.js **>= 18.12.1**
- On target device:
  - `free`, `df`, `du`, `uptime`, `hostname`, `ps` (BusyBox OK)
  - Access to `/proc/stat` and (optionally) `/sys/class/thermal`

---

## Project Layout

```txt
vpos-dashboard/
  src/
    vpos-dashboard.ts          # Node HTTP server + API
    interfaces/                # Types used by server (and as reference)
    snippets/                  # Server helpers (content-type, size humanizer, etc.)
	public/
		index.html               	 # UI
		styles.css               	 # UI styles
		app.js                   	 # UI logic (plain JS, no modules)
  dist/
    vpos-dashboard.js          # Compiled server output
```
````

## Build

On the dev machine:

```bash
npm install
npm run build
```

This runs:

- formatting
- `tsc` (server compile to `dist/`)

---

## Run

### Local / Dev

```bash
npm run dev
```

### Production

```bash
npm run prod
```

Or directly:

```bash
node dist/vpos-dashboard.js
```

Default port is **8000**. Override with:

```bash
PORT=9000 node dist/vpos-dashboard.js
```

Open:

- Dashboard UI: `http://<host>:8000/`
- API stats: `http://<host>:8000/api/stats`
- Directory usage: `http://<host>:8000/api/dir-usage?path=/opt/fccapps`

---

## Deploy to a Minimal Device (no npm install on device)

1. Build on your dev machine:

```bash
npm run build
```

2. Copy the following to the target device:

- `dist/vpos-dashboard.js`
- `dist/public/` (contains `index.html`, `styles.css`, `app.js`)

3. Start on the device:

```bash
node dist/vpos-dashboard.js
```

4. Verify:

```bash
curl http://localhost:8000/api/stats
curl -I http://localhost:8000/app.js
```

## API

### `GET /api/stats`

Returns:

- `hostname`
- `timestamp`
- `memory` (MiB)
- `swap` (MiB)
- `disks` (KiB + human readable strings)
- `load`
- `processes` (sorted by VSZ descending)
- `directories` (subdirs of `/opt/fccapps/vpos-perm`)
- `cpu` (usagePercent from `/proc/stat`)
- `temperatures` (thermal zones)

### `GET /api/dir-usage?path=/some/path`

Returns sizes for direct subdirectories of `path`.

Security:

- Only allows paths under:
  - `/opt/fccapps`
  - `/media/appfs`

## Notes / Known Behaviors

- **CPU first sample:** CPU usage is `null` on the very first request (needs a previous sample).
- **BusyBox `ps`:** This project uses `ps` without flags because BusyBox may not support `ps aux`.
- **Disk selection:** If `/media/appfs` exists, it’s treated as the “main disk” and preferred in the UI.
- **Directory size cost:** `du -sk` can be expensive on large trees; use refresh sparingly if needed.

## Troubleshooting

### UI loads but shows “Collecting metrics…” forever

- Check API:

  ```bash
  curl http://localhost:8000/api/stats
  ```

- Check static files exist and are served:

  ```bash
  curl -I http://localhost:8000/app.js
  curl -I http://localhost:8000/styles.css
  ```

### `404` for `/app.js`

- Make sure `dist/public/app.js` exists after build.
- Confirm server `publicDir` points to `dist/public`:
  - In server code:

    ```ts
    const publicDir = path.resolve(__dirname, 'public')
    ```

  - When running `node dist/vpos-dashboard.js`, `__dirname` is `dist/`.

### Top processes empty

- Confirm `ps` works on device:

  ```bash
  ps
  ```

## Security Considerations

- Directory inspection is restricted to known roots to avoid arbitrary filesystem reads.
- `du` paths are quoted/escaped to reduce injection risk.
- Consider binding to localhost only or placing behind nginx if exposing externally.

## License

ISC
