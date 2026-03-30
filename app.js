/* ===== STATE & CONFIG ===== */
let activeFiles = [];
let currentFileIndex = -1;
let chart = null;
let map = null;
let mapPolyline = null;
let mapMarker = null;

/* ===== SERVICE WORKER ===== */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ===== INITIALIZATION ===== */
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
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            handleFiles(e.dataTransfer.files);
        };
    }

    if (fileInput) fileInput.onchange = (e) => handleFiles(e.target.files);

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.onclick = exportCurrentFile;

    // Power Slider logic
    const powerSlider = document.getElementById('powerSlider');
    if (powerSlider) {
        powerSlider.oninput = (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('powerOffsetDisplay').textContent = (val >= 0 ? '+' : '') + val + 'W';
            applyLivePowerOffset(val);
        };
    }
}

/* ===== FILE HANDLING ===== */
async function handleFiles(files) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'grid';

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'gpx' && ext !== 'fit') continue;

        const fileData = {
            name: file.name,
            ext: ext,
            raw: file,
            points: [],
            originalPower: [], // Per reset/live editing
            modified: false
        };

        try {
            if (ext === 'gpx') await parseGPX(fileData);
            else await parseFIT(fileData);
            
            activeFiles.push(fileData);
        } catch (err) {
            console.error('Error:', err);
            alert(`Errore: ${file.name}`);
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
    const xml = new DOMParser().parseFromString(text, "text/xml");
    fileData.xml = xml;

    const trks = xml.querySelectorAll('trkpt');
    trks.forEach(pt => {
        const pwrStr = pt.querySelector('power, PowerInWatts')?.textContent;
        const pwr = pwrStr ? parseInt(pwrStr) : null;
        const point = {
            lat: parseFloat(pt.getAttribute('lat')),
            lon: parseFloat(pt.getAttribute('lon')),
            ele: parseFloat(pt.querySelector('ele')?.textContent || 0),
            time: new Date(pt.querySelector('time')?.textContent || Date.now()),
            pwr: pwr
        };
        fileData.points.push(point);
        fileData.originalPower.push(pwr);
    });
}

async function parseFIT(fileData) {
    const arrayBuffer = await fileData.raw.arrayBuffer();
    const { default: FitParser } = await import('https://cdn.jsdelivr.net/npm/fit-file-parser@2.3.3/+esm');
    const parser = new FitParser({ force: true, mode: 'both' });

    return new Promise((resolve, reject) => {
        parser.parse(arrayBuffer, (err, data) => {
            if (err) return reject(err);
            const records = data.records || [];
            records.forEach(r => {
                const point = {
                    lat: r.position_lat,
                    lon: r.position_long,
                    ele: r.altitude || 0,
                    time: new Date(r.timestamp),
                    pwr: r.power ?? null
                };
                fileData.points.push(point);
                fileData.originalPower.push(point.pwr);
            });
            resolve();
        });
    });
}

/* ===== UI UPDATES ===== */
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
        card.innerHTML = `
            <div style="font-weight:600; font-size:0.875rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${file.name}</div>
            <div class="stat-label">${file.points.length} punti</div>
        `;
        card.onclick = () => {
            currentFileIndex = i;
            renderActiveFile();
            renderPreviewList();
        };
        list.appendChild(card);
    });
}

function renderActiveFile() {
    const file = activeFiles[currentFileIndex];
    document.getElementById('fileInfo').textContent = file.name;
    
    // Stats
    const avgPwr = Math.round(file.points.reduce((a, b) => a + (b.pwr || 0), 0) / (file.points.filter(p => p.pwr !== null).length || 1));
    document.getElementById('powerAvgLabel').textContent = `Originale: ${avgPwr}W`;
    document.getElementById('powerSlider').value = 0;
    document.getElementById('powerOffsetDisplay').textContent = '+0W';

    // Placeholder stats (calcolabili se necessario)
    document.getElementById('statDist').textContent = '-- km';
    document.getElementById('statEle').textContent = Math.round(Math.max(...file.points.map(p => p.ele)) - Math.min(...file.points.map(p => p.ele))) + ' m';

    renderChart(file);
    renderMap(file);
}

function renderChart(file) {
    const ctx = document.getElementById('activityChart').getContext('2d');
    if (chart) chart.destroy();

    const step = Math.max(1, Math.floor(file.points.length / 800));
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chart) chart.destroy();

    const step = Math.max(1, Math.floor(file.points.length / 500));
    const sampled = file.points.filter((_, i) => i % step === 0);

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sampled.map(p => p.time.toLocaleTimeString()),
            datasets: [
                {
                    label: 'Potenza (W)',
                    data: sampled.map(p => p.pwr),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'Quota (m)',
                    data: sampled.map(p => p.ele),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    borderWidth: 1,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: { position: 'left', title: { display: true, text: 'Watt' } },
                y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Quota' } }
            }
        }
    });
}

/* ===== LIVE EDITING ===== */
function applyLivePowerOffset(offset) {
    const file = activeFiles[currentFileIndex];
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Watt' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Metri' }
                }
            }
        }
    });
}

function renderMap(file) {
    if (!map) return;
    if (mapPolyline) map.removeLayer(mapPolyline);
    if (mapMarker) map.removeLayer(mapMarker);

    const latlngs = file.points
        .filter(p => p.lat !== null && p.lon !== null)
        .map(p => [p.lat, p.lon]);

    if (latlngs.length > 0) {
        mapPolyline = L.polyline(latlngs, { color: '#3b82f6', weight: 4 }).addTo(map);
        mapMarker = L.circleMarker(latlngs[0], { radius: 6, color: '#10b981', fillOpacity: 1 }).addTo(map);
        map.fitBounds(mapPolyline.getBounds(), { padding: [20, 20] });
    }
}

/* ===== EDITING FUNCTIONS ===== */
function applyPowerChanges() {
    if (currentFileIndex === -1) return;
    const file = activeFiles[currentFileIndex];
    const pctInput = document.getElementById('powerPct');
    const addInput = document.getElementById('powerAdd');

    const pct = (parseFloat(pctInput.value) || 0) / 100 + 1;
    const add = parseInt(addInput.value) || 0;

    file.points.forEach(p => {
        if (p.pwr !== null) {
            p.pwr = Math.round(p.pwr * pct + add);
        }
    });

    file.modified = true;
    renderChart(file);
    alert('Potenza aggiornata!');
}

function applySpeedChanges() {
    if (currentFileIndex === -1) return;
    const file = activeFiles[currentFileIndex];
    const multInput = document.getElementById('speedMult');
    const mult = parseFloat(multInput.value) || 1.0;

    if (mult === 1.0) return;

    const startTime = file.points[0].time.getTime();
    file.points.forEach((p, i) => {
        if (file.originalPower[i] !== null) {
            p.pwr = Math.max(0, file.originalPower[i] + offset);
        }
    });
    // Update chart data directly for performance
    const step = Math.max(1, Math.floor(file.points.length / 800));
    const sampledPwr = file.points.filter((_, i) => i % step === 0).map(p => p.pwr);
    chart.data.datasets[0].data = sampledPwr;
    chart.update('none'); // Update without animation for smoothness

    file.modified = true;
    renderChart(file);
    alert('Velocita/Tempo aggiornati!');
}

/* ===== EXPORT ===== */
function exportCurrentFile() {
    if (currentFileIndex === -1) return;
    const file = activeFiles[currentFileIndex];
    if (file.ext === 'gpx') exportGPX(file);
    else exportFITasGPX(file);
}

function exportGPX(file) {
    const xml = file.xml.cloneNode(true);
    const trks = xml.querySelectorAll('trkpt');
    trks.forEach((pt, i) => {
        const pwr = file.points[i].pwr;
        if (pwr === null) return;
        let pNode = pt.querySelector('power, PowerInWatts');
        if (pNode) pNode.textContent = pwr;
    });
    const blob = new Blob([new XMLSerializer().serializeToString(xml)], {type: 'text/xml'});
    downloadBlob(blob, file.name.replace('.gpx', '_mod.gpx'));
}

function exportFITasGPX(file) {
    // Basic GPX implementation for FIT files
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CycleEdit Pro" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${file.name}</name><trkseg>
${file.points.map(p => `
<trkpt lat="${p.lat || 0}" lon="${p.lon || 0}">
    <ele>${p.ele}</ele>
    <time>${p.time.toISOString()}</time>
    <extensions><power>${p.pwr ?? 0}</power></extensions>
</trkpt>`).join('')}
</trkseg></trk></gpx>`;
    downloadBlob(new Blob([gpx], {type: 'text/xml'}), file.name.replace('.fit', '_mod.gpx'));

    if (file.ext === 'gpx') {
        exportGPX(file);
    } else {
        exportFITasGPX(file);
    }
}

function exportFITasGPX(file) {
    const ns = 'http://www.topografix.com/GPX/1/1';
    const nsXsi = 'http://www.w3.org/2001/XMLSchema-instance';
    const doc = document.implementation.createDocument(ns, 'gpx', null);
    const root = doc.documentElement;

    root.setAttribute('version', '1.1');
    root.setAttribute('creator', 'CycleEdit Pro');
    root.setAttribute('xmlns:xsi', nsXsi);

    const trk = doc.createElementNS(ns, 'trk');
    const trkseg = doc.createElementNS(ns, 'trkseg');

    file.points.forEach(p => {
        const trkpt = doc.createElementNS(ns, 'trkpt');
        if (p.lat !== null) trkpt.setAttribute('lat', p.lat);
        if (p.lon !== null) trkpt.setAttribute('lon', p.lon);

        if (p.ele !== null) {
            const ele = doc.createElementNS(ns, 'ele');
            ele.textContent = p.ele;
            trkpt.appendChild(ele);
        }

        const time = doc.createElementNS(ns, 'time');
        time.textContent = p.time.toISOString();
        trkpt.appendChild(time);

        if (p.pwr !== null) {
            const ext = doc.createElementNS(ns, 'extensions');
            const pwr = doc.createElement('power');
            pwr.textContent = p.pwr;
            ext.appendChild(pwr);
            trkpt.appendChild(ext);
        }

        trkseg.appendChild(trkpt);
    });

    trk.appendChild(trkseg);
    root.appendChild(trk);

    const blob = new Blob([new XMLSerializer().serializeToString(doc)], { type: 'text/xml' });
    downloadBlob(blob, file.name.replace('.fit', '_mod.gpx'));
}

function exportGPX(file) {
    const newXml = file.xml.cloneNode(true);
    const trks = newXml.querySelectorAll('trkpt');

    trks.forEach((pt, i) => {
        const pointData = file.points[i];
        if (!pointData) return;

        let pNode = pt.querySelector('power');
        if (!pNode) pNode = pt.querySelector('PowerInWatts');

        if (pNode && pointData.pwr !== null) {
            pNode.textContent = pointData.pwr;
        }

        const tNode = pt.querySelector('time');
        if (tNode) {
            tNode.textContent = pointData.time.toISOString();
        }
    });

    const blob = new Blob([new XMLSerializer().serializeToString(newXml)], { type: 'text/xml' });
    downloadBlob(blob, `${file.name.replace('.gpx', '')}_mod.gpx`);
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}
