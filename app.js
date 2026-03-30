/* ===== STATO APPLICAZIONE ===== */
let activeFiles = [];
let currentFileIndex = -1;
let chart = null;

/* ===== INIZIALIZZAZIONE ===== */
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

/* ===== EVENT LISTENERS ===== */
function setupEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    };
    dropZone.ondragleave = () => dropZone.classList.remove('active');
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        handleFiles(e.dataTransfer.files);
    };

    fileInput.onchange = (e) => handleFiles(e.target.files);

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.onclick = exportFile;
}

/* ===== GESTIONE FILE ===== */
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
            modified: false
        };

        try {
            if (ext === 'gpx') {
                await parseGPX(fileData);
            } else {
                await parseFIT(fileData);
            }
            activeFiles.push(fileData);
        } catch (err) {
            console.error('Error parsing file:', file.name, err);
            alert(`Errore nel caricamento di ${file.name}`);
        }
    }

    if (activeFiles.length > 0) {
        currentFileIndex = activeFiles.length - 1;
        showEditor(activeFiles[currentFileIndex]);
    }
    
    if (overlay) overlay.style.display = 'none';
}

async function parseGPX(fileData) {
    const text = await fileData.raw.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    fileData.xml = xml;

    const trks = xml.querySelectorAll('trkpt');
    trks.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        const ele = parseFloat(pt.querySelector('ele')?.textContent || 0);
        const timeStr = pt.querySelector('time')?.textContent;
        const time = timeStr ? new Date(timeStr) : new Date();
        const pwr = pt.querySelector('power, PowerInWatts')?.textContent;

        fileData.points.push({
            lat, lon, ele, time,
            pwr: pwr ? parseInt(pwr) : null
        });
    });
}

async function parseFIT(fileData) {
    const arrayBuffer = await fileData.raw.arrayBuffer();
    // FitParser constructor from fit-file-parser.js (browser version)
    const fitParser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'km',
        mode: 'cascade'
    });

    return new Promise((resolve, reject) => {
        fitParser.parse(arrayBuffer, (error, data) => {
            if (error) return reject(error);
            fileData.fitData = data;
            
            const records = data.records || [];
            records.forEach(rec => {
                if (rec.position_lat === undefined || rec.position_long === undefined) return;

                // Semicircles to degrees conversion
                const lat = rec.position_lat * (180 / Math.pow(2, 31));
                const lon = rec.position_long * (180 / Math.pow(2, 31));

                fileData.points.push({
                    lat, lon,
                    ele: rec.altitude || 0,
                    time: new Date(rec.timestamp),
                    pwr: rec.power || null,
                    speed: rec.speed || null
                });
            });
            resolve();
        });
    });
}

function showEditor(file) {
    const dropZone = document.getElementById('dropZone');
    const layout = document.getElementById('editorLayout');
    const info = document.getElementById('fileInfo');

    if (dropZone) dropZone.style.display = 'none';
    if (layout) layout.style.display = 'grid';
    if (info) info.textContent = `${file.name} (${file.points.length} punti)`;
    
    renderChart(file);
}

function renderChart(file) {
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
                    yAxisID: 'y'
                },
                {
                    label: 'Quota (m)',
                    data: sampled.map(p => p.ele),
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Watt' } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Metri' } }
            }
        }
    });
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
        if (i === 0) return;
        const origTime = p.time.getTime();
        const diff = origTime - startTime;
        p.time = new Date(startTime + (diff / mult));
    });

    file.modified = true;
    renderChart(file);
    alert('Velocità/Tempo aggiornati!');
}

/* ===== EXPORT ===== */
function exportFile() {
    if (currentFileIndex === -1) return;
    const file = activeFiles[currentFileIndex];

    if (file.ext === 'gpx') {
        exportGPX(file);
    } else {
        exportFIT(file);
    }
}

function exportGPX(file) {
    const newXml = file.xml.cloneNode(true);
    const trks = newXml.querySelectorAll('trkpt');

    trks.forEach((pt, i) => {
        const pointData = file.points[i];
        if (!pointData) return;

        // Update Power
        let pNode = pt.querySelector('power');
        if (!pNode) pNode = pt.querySelector('PowerInWatts');
        
        if (pNode && pointData.pwr !== null) {
            pNode.textContent = pointData.pwr;
        }

        // Update Time
        const tNode = pt.querySelector('time');
        if (tNode) {
            tNode.textContent = pointData.time.toISOString();
        }
    });

    const blob = new Blob([new XMLSerializer().serializeToString(newXml)], {type: 'text/xml'});
    downloadBlob(blob, `${file.name.replace('.gpx', '')}_mod.gpx`);
}

function exportFIT(file) {
    try {
        // FitWriter from @markw65/fit-file-writer
        const writer = new FitWriter();
        
        file.points.forEach(p => {
            const rec = {
                timestamp: p.time,
                position_lat: Math.round(p.lat * (Math.pow(2, 31) / 180)),
                position_long: Math.round(p.lon * (Math.pow(2, 31) / 180)),
                altitude: p.ele,
                power: p.pwr,
                speed: p.speed
            };
            writer.writeMessage('record', rec);
        });

        const fitBlob = writer.finish();
        downloadBlob(fitBlob, `${file.name.replace('.fit', '')}_mod.fit`);
    } catch (err) {
        console.error('FIT Export Error:', err);
        alert('Errore durante l\'esportazione FIT');
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
