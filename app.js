let activeFiles = [];
let currentFileIndex = -1;
let chart = null;
let map = null;
let mapPolyline = null;
let mapMarker = null;
let activeChartMetric = 'pwr';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initMap();
});

function setupEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (dropZone) {
        dropZone.onclick = () => fileInput.click();
        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('active'); };
        dropZone.ondragleave = () => dropZone.classList.remove('active');
        dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('active'); handleFiles(e.dataTransfer.files); };
    }
    if (fileInput) fileInput.onchange = (e) => handleFiles(e.target.files);

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.onclick = exportCurrentFile;

    const powerSlider = document.getElementById('powerSlider');
    if (powerSlider) {
        powerSlider.oninput = (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('powerOffsetDisplay').textContent = (val >= 0 ? '+' : '') + val + 'W';
            applyLivePowerOffset(val);
        };
    }

    document.addEventListener('click', (e) => {
        if (!e.target.matches('[data-metric]')) return;
        activeChartMetric = e.target.dataset.metric;
        document.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderChart(activeFiles[currentFileIndex]);
    });
}

async function handleFiles(files) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'grid';

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'gpx' && ext !== 'fit') continue;

        const fileData = {
            name: file.name,
            ext,
            raw: file,
            points: [],
            originalPower: [],
            originalHR: [],
            originalCadence: [],
            originalSpeed: [],
            originalSessionPower: null,
            sessions: [],
            laps: [],
            deviceInfo: [],
            fitRaw: null,
            modified: false
        };

        try {
            if (ext === 'gpx') await parseGPX(fileData);
            else await parseFIT(fileData);
            activeFiles.push(fileData);
        } catch (err) {
            console.error('Error:', err);
            alert(`Errore nel caricamento: ${file.name}`);
        }
    }

    if (activeFiles.length > 0) {
        currentFileIndex = activeFiles.length - 1;
        updateUI();
    }
    if (overlay) overlay.style.display = 'none';
}

async function parseGPX(fileData) {
    const text = await fileData.raw.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    fileData.xml = xml;
    xml.querySelectorAll('trkpt').forEach(pt => {
        const pwrStr = pt.querySelector('power, PowerInWatts')?.textContent;
        const hrStr = pt.querySelector('hr, heartrate, HeartRateBpm value, bpm')?.textContent;
        const cadStr = pt.querySelector('cad, cadence')?.textContent;
        const point = {
            lat: parseFloat(pt.getAttribute('lat')),
            lon: parseFloat(pt.getAttribute('lon')),
            ele: parseFloat(pt.querySelector('ele')?.textContent || 0),
            time: new Date(pt.querySelector('time')?.textContent || Date.now()),
            pwr: pwrStr ? parseInt(pwrStr) : null,
            hr: hrStr ? parseInt(hrStr) : null,
            cadence: cadStr ? parseInt(cadStr) : null,
            speed: null,
            distance: null,
            temperature: null
        };
        fileData.points.push(point);
        fileData.originalPower.push(point.pwr);
        fileData.originalHR.push(point.hr);
        fileData.originalCadence.push(point.cadence);
        fileData.originalSpeed.push(null);
    });
}

async function parseFIT(fileData) {
    const arrayBuffer = await fileData.raw.arrayBuffer();
    const { default: FitParser } = await import('https://cdn.jsdelivr.net/npm/fit-file-parser@2.3.3/+esm');
    const parser = new FitParser({
        force: true,
        mode: 'both',
        lengthUnit: 'km',
        temperatureUnit: 'celsius',
        speedUnit: 'km/h'
    });

    return new Promise((resolve, reject) => {
        parser.parse(arrayBuffer, (err, data) => {
            if (err) return reject(err);

            fileData.fitRaw = data;
            fileData.sessions = data.sessions || [];
            fileData.laps = data.laps || [];
            fileData.deviceInfo = data.device_infos || [];

            if (fileData.sessions.length > 0) {
                fileData.originalSessionPower = {
                    avg: fileData.sessions[0].avg_power ?? null,
                    max: fileData.sessions[0].max_power ?? null,
                    normalized: fileData.sessions[0].normalized_power ?? null
                };
            }

            (data.records || []).forEach(r => {
                const cadence = (r.cadence ?? 0) + (r.fractional_cadence ?? 0);
                const point = {
                    lat: r.position_lat ?? null,
                    lon: r.position_long ?? null,
                    ele: r.enhanced_altitude ?? r.altitude ?? 0,
                    time: new Date(r.timestamp),
                    pwr: r.power ?? null,
                    hr: r.heart_rate ?? null,
                    cadence: cadence > 0 ? cadence : null,
                    speed: r.enhanced_speed ?? r.speed ?? null,
                    distance: r.distance ?? null,
                    temperature: r.temperature ?? null,
                    verticalOscillation: r.vertical_oscillation ?? null,
                    stanceTime: r.stance_time ?? null,
                    leftRightBalance: r.left_right_balance ?? null,
                    calories: r.calories ?? null
                };
                fileData.points.push(point);
                fileData.originalPower.push(point.pwr);
                fileData.originalHR.push(point.hr);
                fileData.originalCadence.push(point.cadence);
                fileData.originalSpeed.push(point.speed);
            });

            resolve();
        });
    });
}

function computeStats(fileData) {
    const { points, sessions, laps } = fileData;
    const s = sessions[0];

    const distanceKm = s?.total_distance != null
        ? (s.total_distance).toFixed(2)
        : calcDistance(points).toFixed(2);

    return {
        distance: distanceKm,
        duration: s?.total_timer_time != null ? formatDuration(s.total_timer_time) : calcDuration(points),
        totalAscent: s?.total_ascent ?? calcElevation(points),
        totalDescent: s?.total_descent ?? null,
        avgSpeed: s?.avg_speed != null ? parseFloat(s.avg_speed).toFixed(1) : (avg(points, 'speed') != null ? avg(points, 'speed').toFixed(1) : null),
        maxSpeed: s?.max_speed != null ? parseFloat(s.max_speed).toFixed(1) : (max(points, 'speed') != null ? max(points, 'speed').toFixed(1) : null),
        avgPower: s?.avg_power ?? avg(points, 'pwr'),
        maxPower: s?.max_power ?? max(points, 'pwr'),
        normalizedPower: s?.normalized_power ?? calcNP(points),
        avgHR: s?.avg_heart_rate ?? avg(points, 'hr'),
        maxHR: s?.max_heart_rate ?? max(points, 'hr'),
        avgCadence: s?.avg_cadence ?? avg(points, 'cadence'),
        maxCadence: s?.max_cadence ?? max(points, 'cadence'),
        totalCalories: s?.total_calories ?? null,
        tss: s?.training_stress_score != null ? Math.round(s.training_stress_score) : null,
        intensityFactor: s?.intensity_factor != null ? s.intensity_factor.toFixed(2) : null,
        totalWork: s?.total_work != null ? Math.round(s.total_work / 1000) : null
    };
}

function avg(points, key) {
    const vals = points.map(p => p[key]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function max(points, key) {
    const vals = points.map(p => p[key]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    return Math.round(Math.max(...vals));
}

function calcDistance(points) {
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].lat == null || points[i - 1].lat == null) continue;
        dist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    return dist;
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcElevation(points) {
    let gain = 0;
    for (let i = 1; i < points.length; i++) {
        const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
        if (diff > 0) gain += diff;
    }
    return Math.round(gain);
}

function calcDuration(points) {
    if (points.length < 2) return '0:00:00';
    return formatDuration((points[points.length - 1].time - points[0].time) / 1000);
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function calcNP(points) {
    const pwrVals = points.map(p => p.pwr).filter(v => v != null);
    if (pwrVals.length < 30) return null;
    const windowSize = 30;
    const rolling = [];
    for (let i = windowSize - 1; i < pwrVals.length; i++) {
        const slice = pwrVals.slice(i - windowSize + 1, i + 1);
        rolling.push(slice.reduce((a, b) => a + b, 0) / windowSize);
    }
    return Math.round((rolling.reduce((a, b) => a + b ** 4, 0) / rolling.length) ** 0.25);
}

function updateUI() {
    document.getElementById('dropZone').style.display = 'none';
    document.getElementById('editorLayout').style.display = 'grid';
    renderPreviewList();
    renderActiveFile();
}

function renderPreviewList() {
    const list = document.getElementById('activityList');
    list.innerHTML = '';
    activeFiles.forEach((file, i) => {
        const card = document.createElement('div');
        card.className = `preview-card ${i === currentFileIndex ? 'active' : ''}`;
        const stats = computeStats(file);
        card.innerHTML = `
            <div class="preview-name">${file.name}</div>
            <div class="preview-meta">${stats.distance} km · ${stats.duration}</div>
        `;
        card.onclick = () => { currentFileIndex = i; renderPreviewList(); renderActiveFile(); };
        list.appendChild(card);
    });
}

function renderActiveFile() {
    const file = activeFiles[currentFileIndex];
    if (!file) return;

    const powerSlider = document.getElementById('powerSlider');
    if (powerSlider) {
        powerSlider.value = 0;
        document.getElementById('powerOffsetDisplay').textContent = '+0W';
    }

    const hasPwr = file.points.some(p => p.pwr != null);
    const hasHR = file.points.some(p => p.hr != null);
    const hasCadence = file.points.some(p => p.cadence != null);
    const hasSpeed = file.points.some(p => p.speed != null);

    if (!hasPwr && activeChartMetric === 'pwr') activeChartMetric = 'ele';

    const metricBtns = document.getElementById('metricBtns');
    if (metricBtns) {
        metricBtns.innerHTML = `
            <button data-metric="ele" class="${activeChartMetric === 'ele' ? 'active' : ''}">Elevazione</button>
            ${hasPwr ? `<button data-metric="pwr" class="${activeChartMetric === 'pwr' ? 'active' : ''}">Potenza</button>` : ''}
            ${hasHR ? `<button data-metric="hr" class="${activeChartMetric === 'hr' ? 'active' : ''}">FC</button>` : ''}
            ${hasCadence ? `<button data-metric="cadence" class="${activeChartMetric === 'cadence' ? 'active' : ''}">Cadenza</button>` : ''}
            ${hasSpeed ? `<button data-metric="speed" class="${activeChartMetric === 'speed' ? 'active' : ''}">Velocità</button>` : ''}
        `;
    }

    renderStats(file);
    renderChart(file);
    renderMap(file);
}

function renderStats(file) {
    const el = document.getElementById('statsPanel');
    if (!el) return;
    const stats = computeStats(file);

    const stat = (label, value, unit = '') =>
        value != null ? `<div class="stat-item"><span class="stat-label">${label}</span><span class="stat-value">${value}${unit}</span></div>` : '';

    el.innerHTML = `
        <div class="stats-grid">
            ${stat('Distanza', stats.distance, ' km')}
            ${stat('Durata', stats.duration)}
            ${stat('Dislivello +', stats.totalAscent, ' m')}
            ${stat('Dislivello -', stats.totalDescent, ' m')}
            ${stat('Vel. Media', stats.avgSpeed, ' km/h')}
            ${stat('Vel. Max', stats.maxSpeed, ' km/h')}
            ${stat('W Avg', stats.avgPower, ' W')}
            ${stat('W Max', stats.maxPower, ' W')}
            ${stat('NP', stats.normalizedPower, ' W')}
            ${stat('FC Avg', stats.avgHR, ' bpm')}
            ${stat('FC Max', stats.maxHR, ' bpm')}
            ${stat('Cadenza', stats.avgCadence, ' rpm')}
            ${stat('Calorie', stats.totalCalories, ' kcal')}
            ${stat('TSS', stats.tss)}
            ${stat('IF', stats.intensityFactor)}
            ${stat('Lavoro', stats.totalWork, ' kJ')}
        </div>
        ${file.laps.length > 1 ? renderLapsTable(file.laps) : ''}
        ${file.deviceInfo.length > 0 ? `<div class="device-info">📱 ${[file.deviceInfo[0].manufacturer, file.deviceInfo[0].garmin_product].filter(Boolean).join(' ')}</div>` : ''}
    `;
}

function renderLapsTable(laps) {
    const rows = laps.map((lap, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${lap.total_distance != null ? (lap.total_distance).toFixed(2) : '—'} km</td>
            <td>${lap.total_timer_time != null ? formatDuration(lap.total_timer_time) : '—'}</td>
            <td>${lap.avg_power ?? '—'} W</td>
            <td>${lap.avg_heart_rate ?? '—'} bpm</td>
            <td>${lap.avg_speed != null ? parseFloat(lap.avg_speed).toFixed(1) : '—'} km/h</td>
            <td>${lap.avg_cadence ?? '—'} rpm</td>
        </tr>
    `).join('');
    return `
        <div class="laps-section">
            <h4>Giri (${laps.length})</h4>
            <table class="laps-table">
                <thead><tr><th>#</th><th>Dist</th><th>Tempo</th><th>W</th><th>FC</th><th>Vel</th><th>Cad</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderChart(file) {
    const ctx = document.getElementById('chartCanvas')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }

    const metric = activeChartMetric;
    const metaMap = {
        pwr:     { label: 'Potenza (W)',      color: '#f59e0b' },
        hr:      { label: 'FC (bpm)',          color: '#ef4444' },
        cadence: { label: 'Cadenza (rpm)',     color: '#8b5cf6' },
        speed:   { label: 'Velocità (km/h)',  color: '#22c55e' },
        ele:     { label: 'Elevazione (m)',    color: '#60a5fa' }
    };
    const meta = metaMap[metric] || metaMap.ele;

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: file.points.map((_, i) => i),
            datasets: [{
                label: meta.label,
                data: file.points.map(p => p[metric] ?? null),
                borderColor: meta.color,
                backgroundColor: meta.color + '22',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: true,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
            }
        }
    });
}

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || !window.L) return;
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function renderMap(file) {
    if (!map) return;
    if (mapPolyline) { map.removeLayer(mapPolyline); mapPolyline = null; }
    if (mapMarker) { map.removeLayer(mapMarker); mapMarker = null; }

    const coords = file.points
        .filter(p => p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon))
        .map(p => [p.lat, p.lon]);

    if (!coords.length) return;

    mapPolyline = L.polyline(coords, { color: '#f59e0b', weight: 3 }).addTo(map);
    map.fitBounds(mapPolyline.getBounds(), { padding: [20, 20] });
    mapMarker = L.circleMarker(coords[0], {
        radius: 8, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1
    }).addTo(map);
}

function applyLivePowerOffset(offset) {
    const file = activeFiles[currentFileIndex];
    if (!file) return;

    file.points.forEach((p, i) => {
        const orig = file.originalPower[i];
        p.pwr = orig != null ? Math.max(0, orig + offset) : null;
    });

    if (file.sessions.length > 0 && file.originalSessionPower) {
        const osp = file.originalSessionPower;
        const s = file.sessions[0];
        if (osp.avg != null) s.avg_power = Math.max(0, osp.avg + offset);
        if (osp.max != null) s.max_power = Math.max(0, osp.max + offset);
        s.normalized_power = calcNP(file.points);
    }

    file.modified = offset !== 0;
    if (activeChartMetric === 'pwr') renderChart(file);
    renderStats(file);
}

async function exportCurrentFile() {
    const file = activeFiles[currentFileIndex];
    if (!file) return;
    file.ext === 'gpx' ? exportGPX(file) : exportFIT(file);
}

function exportGPX(file) {
    const xml = file.xml;
    const pts = xml.querySelectorAll('trkpt');
    pts.forEach((pt, i) => {
        const p = file.points[i];
        if (!p) return;
        let ext = pt.querySelector('extensions');
        if (!ext) { ext = xml.createElement('extensions'); pt.appendChild(ext); }

        const setNode = (tag, val) => {
            let node = ext.querySelector(tag);
            if (!node) { node = xml.createElement(tag); ext.appendChild(node); }
            node.textContent = val;
        };

        if (p.pwr != null) setNode('power', p.pwr);
        if (p.hr != null) setNode('hr', p.hr);
        if (p.cadence != null) setNode('cad', Math.round(p.cadence));
        if (p.speed != null) setNode('speed', p.speed);
    });

    const str = new XMLSerializer().serializeToString(xml);
    downloadBlob(new Blob([str], { type: 'application/gpx+xml' }), file.name.replace('.gpx', '_modified.gpx'));
}

function exportFIT(file) {
    if (!file.modified) {
        file.raw.arrayBuffer().then(buf => {
            downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), file.name);
        });
        return;
    }
    exportFITasGPX(file);
}

function exportFITasGPX(file) {
    const doc = document.implementation.createDocument(null, 'gpx', null);
    const gpx = doc.documentElement;
    gpx.setAttribute('version', '1.1');
    gpx.setAttribute('creator', 'CycleEdit');
    gpx.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1');
    gpx.setAttribute('xmlns:gpxtpx', 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1');

    const trk = doc.createElement('trk');
    const trkseg = doc.createElement('trkseg');
    trk.appendChild(trkseg);
    gpx.appendChild(trk);

    file.points.forEach(p => {
        if (p.lat == null || p.lon == null) return;

        const trkpt = doc.createElement('trkpt');
        trkpt.setAttribute('lat', p.lat);
        trkpt.setAttribute('lon', p.lon);

        const appendEl = (tag, val, parent) => {
            const el = doc.createElement(tag);
            el.textContent = val;
            parent.appendChild(el);
        };

        if (p.ele != null) appendEl('ele', p.ele, trkpt);
        if (p.time) appendEl('time', p.time.toISOString(), trkpt);

        const ext = doc.createElement('extensions');
        const tpe = doc.createElement('gpxtpx:TrackPointExtension');
        let hasExt = false;

        if (p.pwr != null) { appendEl('power', p.pwr, ext); hasExt = true; }
        if (p.hr != null) { appendEl('gpxtpx:hr', p.hr, tpe); hasExt = true; }
        if (p.cadence != null) { appendEl('gpxtpx:cad', Math.round(p.cadence), tpe); hasExt = true; }
        if (p.speed != null) { appendEl('gpxtpx:speed', p.speed, tpe); hasExt = true; }
        if (p.temperature != null) { appendEl('gpxtpx:atemp', p.temperature, tpe); hasExt = true; }

        if (hasExt) { ext.appendChild(tpe); trkpt.appendChild(ext); }
        trkseg.appendChild(trkpt);
    });

    const str = new XMLSerializer().serializeToString(doc);
    downloadBlob(new Blob([str], { type: 'application/gpx+xml' }), file.name.replace('.fit', '_modified.gpx'));
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
