const MAX_HISTORY = 40
const MEM_HISTORY = []
const CPU_HISTORY = []
const LOAD1_HISTORY = []
let DIR_STACK = [] // stack of { title, items, basePath }
let CURRENT_DIR_VIEW = null // { title, items, basePath }
const AUTO_REFRESH_MS = 60 * 60 * 1000 // 1 hour
const BASE_ROOT = '/opt/fccapps/vpos-perm'

let currentTheme = 'light'
let currentDensity = 'comfortable'

let tickInFlight = false

const tick = async () => {
	if (tickInFlight) return
	tickInFlight = true
	try {
		const stats = await fetchStats()
		if (stats) updateDashboard(stats)
	} finally {
		tickInFlight = false
	}
}

const applyTheme = (theme) => {
	const root = document.documentElement
	root.setAttribute('data-theme', theme)
	localStorage.setItem('dashboard-theme', theme)

	const btn = document.getElementById('theme-toggle')
	if (btn) btn.textContent = theme === 'light' ? 'Light ☀' : 'Dark 🌙'
	return theme
}

const applyDensity = (density) => {
	const root = document.documentElement
	root.setAttribute('data-density', density)
	localStorage.setItem('dashboard-density', density)

	const btn = document.getElementById('density-toggle')
	if (btn)
		btn.textContent = density === 'comfortable' ? 'Comfortable' : 'Compact'
	return density
}

const clampHistory = (arr) => {
	while (arr.length > MAX_HISTORY) arr.shift()
}

const formatMiB = (v) => `${v} MiB`
const formatPercent = (v) => `${v.toFixed(1)}%`

const renderBreadcrumb = (basePath) => {
	// Root view
	if (!basePath) {
		return `Path: <button class="crumb" data-crumb-path=""><code>${getRootLabel()}</code></button>`
	}

	const resolved = basePath.replace(/\/+$/, '')

	// Make crumbs relative to BASE_ROOT when possible (cleaner UI)
	let rel = resolved
	if (resolved.startsWith(BASE_ROOT)) {
		rel = resolved.slice(BASE_ROOT.length).replace(/^\/+/, '')
	}

	const parts = rel ? rel.split('/').filter(Boolean) : []
	const crumbs = []

	// root crumb
	crumbs.push(
		`<button class="crumb" data-crumb-path=""><code>${getRootLabel()}</code></button>`
	)

	// incremental crumbs
	let accum = ''
	for (const p of parts) {
		accum += '/' + p
		const full = BASE_ROOT + accum
		crumbs.push(
			`<button class="crumb" data-crumb-path="${full}"><code>${p}</code></button>`
		)
	}

	return `Path: ${crumbs.join(`<span class="crumb-sep">/</span>`)}`
}

const renderSparkline = (containerId, data, minOverride, maxOverride) => {
	const container = document.getElementById(containerId)
	if (!container) return
	if (!data || data.length < 2) {
		container.innerHTML = ''
		return
	}

	const width = 120
	const height = 32
	const minVal = minOverride !== undefined ? minOverride : Math.min(...data)
	const maxVal = maxOverride !== undefined ? maxOverride : Math.max(...data)
	const span = maxVal - minVal || 1

	const step = width / (data.length - 1)
	const points = data
		.map((v, i) => {
			const x = i * step
			const norm = (v - minVal) / span
			const y = height - norm * (height - 4) - 2
			return `${x.toFixed(1)},${y.toFixed(1)}`
		})
		.join(' ')

	container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="rgb(59,130,246)" stroke-width="1.5" points="${points}" />
      </svg>
    `
}

const updateDashboard = (stats) => {
	const hostnameEl = document.getElementById('hostname')
	const lastUpdatedEl = document.getElementById('last-updated')
	const memoryBar = document.getElementById('memory-bar')
	const cpuBar = document.getElementById('cpu-bar')
	const memorySummary = document.getElementById('memory-summary')
	const cpuSummary = document.getElementById('cpu-summary')
	const tempSummary = document.getElementById('temp-summary')
	const loadValues = document.getElementById('load-values')
	const disksTableBody = document.querySelector('#disks-table tbody')
	const procsTableBody = document.querySelector('#procs-table tbody')
	const procsEmpty = document.getElementById('procs-empty')
	const storageBar = document.getElementById('storage-bar')
	const storageSummary = document.getElementById('storage-summary')
	const dirsList = document.getElementById('dirs-list')
	const dirDetails = document.getElementById('dir-details')

	if (hostnameEl) hostnameEl.textContent = `Host: ${stats.hostname}`
	if (lastUpdatedEl)
		lastUpdatedEl.textContent = `Updated ${new Date(
			stats.timestamp
		).toLocaleTimeString()}`

	if (memoryBar)
		memoryBar.style.width = `${Math.min(stats.memory.usedPercent, 100)}%`
	if (memorySummary) {
		memorySummary.textContent = `${formatMiB(stats.memory.used)} of ${formatMiB(
			stats.memory.total
		)} used (${formatPercent(stats.memory.usedPercent)}), free: ${formatMiB(
			stats.memory.free
		)}`
	}

	const cpuUsage = stats.cpu && stats.cpu.usagePercent
	if (cpuBar)
		cpuBar.style.width = cpuUsage != null ? `${Math.min(cpuUsage, 100)}%` : '0%'
	if (cpuSummary) {
		cpuSummary.textContent =
			cpuUsage != null
				? `CPU usage: ${cpuUsage.toFixed(1)}%`
				: 'CPU usage: sampling…'
	}

	if (tempSummary) {
		const avg = stats.temperatures && stats.temperatures.averageTempC
		const sensors = (stats.temperatures && stats.temperatures.sensors) || []
		if (avg != null && sensors.length) {
			tempSummary.textContent = `Avg temp: ${avg.toFixed(1)}°C (${sensors.length} sensor${
				sensors.length > 1 ? 's' : ''
			})`
		} else {
			tempSummary.textContent = 'No temperature sensors detected.'
		}
	}

	if (loadValues) {
		loadValues.textContent = `1 min: ${stats.load.one.toFixed(2)} • 5 min: ${stats.load.five.toFixed(
			2
		)} • 15 min: ${stats.load.fifteen.toFixed(2)}`
	}

	const disk = stats.disks && stats.disks[0]
	window.__APPFS_DISK__ = disk || null

	if (storageBar && disk) {
		const diskUsePct = parseInt(disk.usePercent, 10) || 0
		storageBar.style.width = `${Math.min(diskUsePct, 100)}%`
	}
	if (storageSummary) {
		storageSummary.textContent = disk
			? `Storage on ${disk.mountpoint}: ${disk.used} of ${disk.size} used (${disk.usePercent}).`
			: 'No disk information available.'
	}

	if (disksTableBody) {
		disksTableBody.innerHTML = ''
		;(stats.disks || []).forEach((d) => {
			const tr = document.createElement('tr')
			const pct = parseInt(d.usePercent, 10) || 0
			let badgeClass = 'badge-ok'
			if (pct >= 90) badgeClass = 'badge-danger'
			else if (pct >= 75) badgeClass = 'badge-warn'

			tr.innerHTML = `
          <td>${d.filesystem}</td>
          <td>${d.size}</td>
          <td>${d.used}</td>
          <td>${d.avail}</td>
          <td><span class="badge ${badgeClass}">${d.usePercent}</span></td>
          <td>${d.mountpoint}</td>
        `
			disksTableBody.appendChild(tr)
		})
	}

	// Tracked storage explorer
	const backBtn = document.getElementById('dir-back')
	if (backBtn && !backBtn.dataset.wired) {
		backBtn.dataset.wired = '1'
		backBtn.addEventListener('click', () => {
			const prev = DIR_STACK.pop() || null
			if (!prev) {
				// return to root
				CURRENT_DIR_VIEW = null
			} else {
				CURRENT_DIR_VIEW = prev
			}
			setDirNavUI()
			// re-render current view (or root if null)
			const rootItems = window.__ROOT_TRACKED_DIRS__ || []
			const itemsToShow = CURRENT_DIR_VIEW ? CURRENT_DIR_VIEW.items : rootItems
			renderDirList(itemsToShow, disk)
			const dirDetails = document.getElementById('dir-details')
			if (dirDetails)
				dirDetails.textContent = CURRENT_DIR_VIEW
					? `Viewing children of ${CURRENT_DIR_VIEW.basePath}`
					: 'Select a directory to see its share of /media/appfs and browse its children.'
		})
	}

	// Root tracked dirs come from stats.directories
	window.__ROOT_TRACKED_DIRS__ = stats.directories || []

	if (!CURRENT_DIR_VIEW) {
		// first time / root view
		DIR_STACK = []
		CURRENT_DIR_VIEW = null
		setDirNavUI()
		renderDirList(window.__ROOT_TRACKED_DIRS__, disk)

		const dirDetails = document.getElementById('dir-details')
		if (dirDetails) {
			dirDetails.textContent =
				'Select a directory to see its share of /media/appfs and browse its children.'
		}
	} else {
		// keep showing whatever view user is exploring (don’t reset on hourly updates)
		setDirNavUI()
		renderDirList(CURRENT_DIR_VIEW.items, disk)
	}

	if (procsTableBody && procsEmpty) {
		procsTableBody.innerHTML = ''
		const procs = stats.processes || []
		if (procs.length === 0) {
			procsEmpty.classList.remove('hidden')
		} else {
			procsEmpty.classList.add('hidden')
			procs.forEach((p) => {
				const tr = document.createElement('tr')
				tr.innerHTML = `
            <td>${p.pid}</td>
            <td>${p.user}</td>
            <td>${p.vsz}</td>
            <td>${p.stat}</td>
            <td>${p.command}</td>
          `
				procsTableBody.appendChild(tr)
			})
		}
	}

	MEM_HISTORY.push(stats.memory.usedPercent)
	clampHistory(MEM_HISTORY)
	renderSparkline('mem-sparkline', MEM_HISTORY, 0, 100)

	if (cpuUsage != null) {
		CPU_HISTORY.push(cpuUsage)
		clampHistory(CPU_HISTORY)
		renderSparkline('cpu-sparkline', CPU_HISTORY, 0, 100)
	}

	LOAD1_HISTORY.push(stats.load.one)
	clampHistory(LOAD1_HISTORY)
	renderSparkline('load-sparkline', LOAD1_HISTORY)
}

const getRootLabel = () => 'vpos-perm'

const fetchDirUsage = async (p) => {
	const resultEl = document.getElementById('dir-input-result')
	if (!p) {
		if (resultEl) resultEl.textContent = 'Please enter a directory path.'
		return
	}
	if (resultEl) resultEl.textContent = 'Loading…'
	try {
		const res = await fetch('/api/dir-usage?path=' + encodeURIComponent(p))
		if (!res.ok) {
			if (resultEl) resultEl.textContent = 'Failed to fetch directory usage.'
			return
		}
		const data = await res.json()
		if (!data.length) {
			if (resultEl)
				resultEl.textContent = 'No subdirectories found or no access.'
			return
		}
		if (resultEl) {
			resultEl.textContent = data
				.map((d) => {
					const name = d.path.replace(/\/+$/, '').split('/').pop() || d.path
					return `${name}: ${d.usedHuman}`
				})
				.join(' | ')
		}
	} catch {
		if (resultEl) resultEl.textContent = 'Error calling /api/dir-usage.'
	}
}

const fetchDirChildren = async (p) => {
	const res = await fetch('/api/dir-usage?path=' + encodeURIComponent(p))
	if (!res.ok) return []
	return await res.json() // [{path, usedKB, usedHuman}]
}

const fetchStats = async () => {
	try {
		const res = await fetch('/api/stats')
		if (!res.ok) return null
		return await res.json()
	} catch {
		return null
	}
}

const buildStackForPath = (targetPath) => {
	// Rebuild stack so Back works sensibly after crumb-jump
	// Storing views as navigate
	const stack = []

	if (!targetPath) return stack // root

	// Build chain relative to BASE_ROOT if target is under it
	let cur = targetPath.replace(/\/+$/, '')
	if (!cur.startsWith(BASE_ROOT)) return stack

	let rel = cur.slice(BASE_ROOT.length).replace(/^\/+/, '')
	const parts = rel ? rel.split('/').filter(Boolean) : []

	let accum = BASE_ROOT
	// stack entries should represent "previous views"
	for (let i = 0; i < parts.length - 1; i++) {
		accum += '/' + parts[i]
		stack.push({ title: parts[i], items: [], basePath: accum })
	}
	return stack
}

const navigateToDir = async (targetPath, disk) => {
	// Root
	if (!targetPath) {
		CURRENT_DIR_VIEW = null
		DIR_STACK = []
		setDirNavUI()
		renderDirList(window.__ROOT_TRACKED_DIRS__ || [], disk)
		const dirDetails = document.getElementById('dir-details')
		if (dirDetails) {
			dirDetails.textContent =
				'Select a directory to see its share of /media/appfs and browse its children.'
		}
		return
	}

	const children = await fetchDirChildren(targetPath)
	if (!children || children.length === 0) {
		// Don’t navigate if empty; keep current, just message
		const dirDetails = document.getElementById('dir-details')
		if (dirDetails) {
			dirDetails.innerHTML = `
        <strong>No subfolders</strong> (or access restricted) for:
        <div class="muted small" style="margin-top:6px;"><code>${targetPath}</code></div>
      `
		}
		return
	}
	DIR_STACK = buildStackForPath(targetPath)
	const title = targetPath.replace(/\/+$/, '').split('/').pop() || targetPath
	CURRENT_DIR_VIEW = { title, items: children, basePath: targetPath }

	setDirNavUI()
	renderDirList(children, disk)

	const dirDetails = document.getElementById('dir-details')
	if (dirDetails)
		dirDetails.innerHTML = `<strong>${title}</strong> — showing subfolders (sorted by size).`
}

// Wire crumb clicks once (event delegation)
const wireBreadcrumbClicksOnce = () => {
  const label = document.getElementById('dir-path-label')
  if (!label || label.dataset.wired) return
  label.dataset.wired = '1'

  label.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.crumb') : null
    if (!btn) return
    const targetPath = btn.dataset.crumbPath || ''
    // we need disk for percent-of-disk calculations in dir list
    const lastDisk = window.__APPFS_DISK__ || null
    await navigateToDir(targetPath, lastDisk)
  })
}

const setDirNavUI = () => {
	const backBtn = document.getElementById('dir-back')
	const label = document.getElementById('dir-path-label')

	if (backBtn) backBtn.classList.toggle('hidden', DIR_STACK.length === 0)

	if (label) {
		label.innerHTML = renderBreadcrumb(CURRENT_DIR_VIEW?.basePath || '')
		wireBreadcrumbClicksOnce()
	}
}

const startPolling = () => {
	tick() // initial load
	setInterval(tick, AUTO_REFRESH_MS)
}

const renderDirList = (items, disk) => {
	const dirsList = document.getElementById('dirs-list')
	const dirDetails = document.getElementById('dir-details')
	if (!dirsList || !dirDetails) return

	dirsList.innerHTML = ''

	if (!items || items.length === 0) {
		dirDetails.textContent = 'No subdirectories found (or no access).'
		return
	}

	const activeClass = 'active'

	items.forEach((dir) => {
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.className = 'dir-item'

		const percentOfDisk =
			disk && disk.sizeKB > 0 ? (dir.usedKB / disk.sizeKB) * 100 : 0

		const shortName = dir.path.replace(/\/+$/, '').split('/').pop() || dir.path

		btn.innerHTML = `
			<div class="dir-item-label">
				<span>${shortName}</span>
				<span>${percentOfDisk.toFixed(1)}%</span>
			</div>
			<div class="dir-item-path">${dir.usedHuman} • ${dir.path}</div>
		`

		btn.addEventListener('click', async () => {
			// highlight selection
			dirsList
				.querySelectorAll('.dir-item')
				.forEach((s) => s.classList.remove(activeClass))
			btn.classList.add(activeClass)

			// show summary immediately
			dirDetails.innerHTML = `
				<strong>${shortName}</strong> is using <strong>${dir.usedHuman}</strong>,
				which is <strong>${percentOfDisk.toFixed(2)}%</strong> of total storage on
				<code>${disk?.mountpoint || '/media/appfs'}</code>.
				<br/>
				<span class="muted small">Checking children…</span>
			`

			const children = await fetchDirChildren(dir.path)

			// If no children, don't navigate; just show message
			if (!children || children.length === 0) {
				dirDetails.innerHTML = `
					<strong>${shortName}</strong> has no subfolders (or access is restricted).
					<div class="muted small" style="margin-top:6px;">
						Size: <strong>${dir.usedHuman}</strong> • Path: <code>${dir.path}</code>
					</div>
				`
				return
			}

			// Navigate into children
			if (CURRENT_DIR_VIEW) DIR_STACK.push(CURRENT_DIR_VIEW)
			CURRENT_DIR_VIEW = {
				title: shortName,
				items: children,
				basePath: dir.path
			}

			setDirNavUI()
			renderDirList(children, disk)

			dirDetails.innerHTML = `
    <strong>${shortName}</strong> — showing subfolders (sorted by size).
  `
		})

		dirsList.appendChild(btn)
	})
}

document.addEventListener('DOMContentLoaded', () => {
	const savedTheme = localStorage.getItem('dashboard-theme') || 'light'
	const savedDensity =
		localStorage.getItem('dashboard-density') || 'comfortable'

	const refreshBtn = document.getElementById('refresh-btn')
	if (refreshBtn) {
		refreshBtn.addEventListener('click', () => {
			tick()
		})
	}

	currentTheme = applyTheme(savedTheme)
	currentDensity = applyDensity(savedDensity)

	const themeBtn = document.getElementById('theme-toggle')
	if (themeBtn) {
		themeBtn.addEventListener('click', () => {
			const next = currentTheme === 'light' ? 'dark' : 'light'
			currentTheme = applyTheme(next)
		})
	}

	const densityBtn = document.getElementById('density-toggle')
	if (densityBtn) {
		densityBtn.addEventListener('click', () => {
			const next = currentDensity === 'comfortable' ? 'compact' : 'comfortable'
			currentDensity = applyDensity(next)
		})
	}

	const dirBtn = document.getElementById('dir-fetch')
	const dirInput = document.getElementById('dir-path')
	if (dirBtn && dirInput) {
		dirBtn.addEventListener('click', () => fetchDirUsage(dirInput.value.trim()))
	}

	startPolling()
})
