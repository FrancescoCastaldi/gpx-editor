import { computeStats, formatDuration } from './utils.js';

let chart = null;
let map = null;
let mapPolyline = null;
let mapMarker = null;

export function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || !window.L) return;
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

export function showEditor() {
    const uploadSection = document.getElementById('uploadSection');
    const editorLayout = document.getElementById('editorLayout');
    if (uploadSection) uploadSection.classList.add('hidden');
    if (editorLayout) editorLayout.classList.add('visible');
}

export function renderPreviewList(activeFiles, currentFileIndex, onSelect) {
    const list = document.getElementById('activityList');
    if (!list) return;
    list.innerHTML = '';

    activeFiles.forEach((file, i) => {
        const card = document.createElement('div');
        card.className = `preview-card ${i === currentFileIndex ? 'active' : ''}`;
        const stats = computeStats(file);
        card.innerHTML = `
            <div class="preview-name">${file.name}</div>
            <div class="preview-meta">${stats.distance} km &middot; ${stats.duration}</div>
        `;
        card.onclick = () => onSelect(i);
        list.appendChild(card);
    });
}

export function renderStats(file) {
    const el = document.getElementById('statsPanel');
    if (!el) return;
    const stats = computeStats(file);

    const stat = (label, value, unit = '') =>
        value != null
            ? `<div class="stat-item"><span class="stat-label">${label}</span><span class="stat-value">${value}${unit}</span></div>`
            : '';

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
        ${file.deviceInfo.length > 0 ? renderDeviceInfo(file.deviceInfo) : ''}
    `;
}

function renderDeviceInfo(devices) {
    const d = devices[0];
    const parts = [d.manufacturer, d.productName, d.garminProduct].filter(Boolean);
    return `<div class="device-info">${parts.join(' ')}</div>`;
}

function renderLapsTable(laps) {
    const rows = laps.map((lap, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${lap.totalDistance != null ? (lap.totalDistance / 1000).toFixed(2) : '\u2014'} km</td>
            <td>${lap.totalTimerTime != null ? formatDuration(lap.totalTimerTime) : '\u2014'}</td>
            <td>${lap.avgPower ?? '\u2014'} W</td>
            <td>${lap.avgHeartRate ?? '\u2014'} bpm</td>
            <td>${lap.avgSpeed != null ? (lap.avgSpeed * 3.6).toFixed(1) : '\u2014'} km/h</td>
            <td>${lap.avgCadence ?? '\u2014'} rpm</td>
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

export function renderChart(file, activeChartMetric) {
    const ctx = document.getElementById('chartCanvas')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }

    const metric = activeChartMetric;
    const metaMap = {
        pwr:     { label: 'Potenza (W)',      color: '#f59e0b' },
        hr:      { label: 'FC (bpm)',          color: '#ef4444' },
        cadence: { label: 'Cadenza (rpm)',     color: '#8b5cf6' },
        speed:   { label: 'Velocit\u00e0 (km/h)', color: '#22c55e' },
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
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
            }
        }
    });
}

export function renderMap(file) {
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

export function renderMetricButtons(file, activeChartMetric) {
    const hasPwr = file.points.some(p => p.pwr != null);
    const hasHR = file.points.some(p => p.hr != null);
    const hasCadence = file.points.some(p => p.cadence != null);
    const hasSpeed = file.points.some(p => p.speed != null);

    const metricBtns = document.getElementById('metricBtns');
    if (!metricBtns) return { hasPwr, hasHR, hasCadence, hasSpeed };

    const active = (m) => activeChartMetric === m ? 'active' : '';

    metricBtns.innerHTML = `
        <button data-metric="ele" class="${active('ele')}">Elevazione</button>
        ${hasPwr ? `<button data-metric="pwr" class="${active('pwr')}">Potenza</button>` : ''}
        ${hasHR ? `<button data-metric="hr" class="${active('hr')}">FC</button>` : ''}
        ${hasCadence ? `<button data-metric="cadence" class="${active('cadence')}">Cadenza</button>` : ''}
        ${hasSpeed ? `<button data-metric="speed" class="${active('speed')}">Velocit\u00e0</button>` : ''}
    `;

    return { hasPwr, hasHR, hasCadence, hasSpeed };
}

export function configurePowerSlider(file) {
    const targetSlider = document.getElementById('powerTargetSlider');
    if (!targetSlider) return;

    const stats = computeStats(file);
    if (stats.avgPower) {
        targetSlider.min = Math.max(1, stats.avgPower - 200).toString();
        targetSlider.max = (stats.avgPower + 200).toString();
        targetSlider.value = stats.avgPower;
        targetSlider.disabled = false;
        document.getElementById('powerTargetDisplay').textContent = stats.avgPower + ' W';
    } else {
        targetSlider.disabled = true;
        document.getElementById('powerTargetDisplay').textContent = '\u2014 W';
    }
}

export function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = show ? 'grid' : 'none';
}

export function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
