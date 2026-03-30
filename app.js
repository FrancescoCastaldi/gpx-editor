/* ===== STATE & CONFIG ===== */
let activeFiles = [];
let currentFileIndex = -1;
let chart = null;

/* ===== SERVICE WORKER ===== */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ===== INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
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
}

function renderChart(file) {
    const ctx = document.getElementById('activityChart').getContext('2d');
    if (chart) chart.destroy();

    const step = Math.max(1, Math.floor(file.points.length / 800));
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
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}
