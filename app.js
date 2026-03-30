/* ===== STATO APPLICAZIONE ===== */
let activeFiles = [];
let currentFileIndex = -1;
let chart = null;

const state = {
    theme: localStorage.getItem('theme') || 'dark',
    editMode: 'both', // 'both', 'watt', 'speed'
    targetWatt: '',
    targetSpeed: ''
};

/* ===== INIZIALIZZAZIONE ===== */
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
});

function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = state.theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    initTheme();
}

/* ===== EVENT LISTENERS ===== */
function setupEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    dropZone.onclick = () => fileInput.click();
    
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    };
    
    dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
    
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    };
    
    fileInput.onchange = (e) => handleFiles(e.target.files);
    
    // Controlli
    document.getElementById('editMode').onchange = (e) => {
        state.editMode = e.target.value;
        updatePreview();
    };
    
    document.getElementById('targetWatt').oninput = (e) => {
        state.targetWatt = e.target.value;
        updatePreview();
    };
    
    document.getElementById('targetSpeed').oninput = (e) => {
        state.targetSpeed = e.target.value;
        updatePreview();
    };
}

/* ===== GESTIONE FILE ===== */
async function handleFiles(files) {
    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'gpx' && ext !== 'fit') continue;
        
        const fileData = {
            name: file.name,
            ext: ext,
            raw: file,
            points: [],
            stats: {},
            modified: false
        };
        
        if (ext === 'gpx') {
            await parseGPX(fileData);
        } else {
            await parseFIT(fileData);
        }
        
        activeFiles.push(fileData);
    }
    
    if (activeFiles.length > 0) {
        if (currentFileIndex === -1) currentFileIndex = 0;
        renderFileList();
        selectFile(currentFileIndex);
        document.getElementById('editorInterface').classList.remove('hidden');
    }
}

async function parseGPX(fileData) {
    const text = await fileData.raw.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    fileData.xml = xml;
    
    const trks = xml.querySelectorAll('trkpt');
    let totalPower = 0;
    let powerCount = 0;
    let totalElev = 0;
    let lastElev = null;
    
    trks.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        const ele = parseFloat(pt.querySelector('ele')?.textContent || 0);
        const time = new Date(pt.querySelector('time')?.textContent);
        const pwr = pt.querySelector('power, PowerInWatts')?.textContent;
        
        const point = { lat, lon, ele, time, pwr: pwr ? parseInt(pwr) : null };
        fileData.points.push(point);
        
        if (point.pwr !== null) {
            totalPower += point.pwr;
            powerCount++;
        }
        
        if (lastElev !== null && ele > lastElev) totalElev += (ele - lastElev);
        lastElev = ele;
    });
    
    calculateBaseStats(fileData, totalPower, powerCount, totalElev);
}

async function parseFIT(fileData) {
    try {
        const arrayBuffer = await fileData.raw.arrayBuffer();
        const fitParser = new FitParser({
            force: true,
            speedUnit: 'km/h',
            lengthUnit: 'km',
            temperatureUnit: 'celsius',
            elapsedRecordField: true,
            mode: 'cascade'
        });
        
        fitParser.parse(arrayBuffer, (error, data) => {
            if (error) {
                console.error('FIT Parse Error:', error);
                showToast("Errore nel parsing del file FIT", "danger");
                return;
            }
            
            fileData.fitData = data;
            
            // Extract record messages (track points)
            const records = data.records || [];
            let totalPower = 0;
            let powerCount = 0;
            let totalElev = 0;
            let lastElev = null;
            
            records.forEach(rec => {
                if (!rec.position_lat || !rec.position_long) return;
                
                const point = {
                    lat: rec.position_lat,
                    lon: rec.position_long,
                    ele: rec.altitude || 0,
                    time: new Date(rec.timestamp),
                    pwr: rec.power || null,
                    speed: rec.speed || null,
                    cadence: rec.cadence || null,
                    heart_rate: rec.heart_rate || null
                };
                
                fileData.points.push(point);
                
                if (point.pwr !== null) {
                    totalPower += point.pwr;
                    powerCount++;
                }
                
                if (lastElev !== null && point.ele > lastElev) {
                    totalElev += (point.ele - lastElev);
                }
                lastElev = point.ele;
            });
            
            calculateBaseStats(fileData, totalPower, powerCount, totalElev);
        });
    } catch (err) {
        console.error('FIT File Error:', err);
        showToast("Impossibile leggere il file FIT", "danger");
    }
}

function calculateBaseStats(fileData, totalPower, powerCount, totalElev) {
    const pts = fileData.points;
    if (pts.length < 2) return;
    
    const dist = calculateDistance(pts);
    const durationMs = pts[pts.length-1].time - pts[0].time;
    const avgSpd = (dist / (durationMs / 3600000)).toFixed(1);
    
    fileData.stats = {
        avgPower: powerCount > 0 ? Math.round(totalPower / powerCount) : 0,
        avgSpeed: parseFloat(avgSpd),
        distance: parseFloat(dist.toFixed(2)),
        duration: formatMs(durationMs),
        count: pts.length,
        elevation: Math.round(totalElev),
        durationMs: durationMs
    };
}

/* ===== UI RENDERING ===== */
function renderFileList() {
    const container = document.getElementById('fileList');
    container.innerHTML = activeFiles.map((f, i) => `
        <div class="file-item ${i === currentFileIndex ? 'active' : ''}" onclick="selectFile(${i})">
            <span>${f.name}</span>
            <button class="btn-remove" onclick="removeFile(event, ${i})">✕</button>
        </div>
    `).join('');
}

function selectFile(index) {
    currentFileIndex = index;
    const file = activeFiles[index];
    
    renderFileList();
    updateDashboard(file.stats);
    renderChart(file);
    
    // Update inputs
    document.getElementById('targetWatt').value = file.stats.avgPower || '';
    document.getElementById('targetSpeed').value = file.stats.avgSpeed || '';
    
    updatePreview();
}

function removeFile(e, index) {
    e.stopPropagation();
    activeFiles.splice(index, 1);
    
    if (currentFileIndex >= activeFiles.length) currentFileIndex = activeFiles.length - 1;
    
    if (activeFiles.length === 0) {
        document.getElementById('editorInterface').classList.add('hidden');
        currentFileIndex = -1;
    } else {
        selectFile(currentFileIndex);
    }
    
    renderFileList();
}

function updateDashboard(stats) {
    document.getElementById('avgPower').textContent = stats.avgPower || '-';
    document.getElementById('avgSpeed').textContent = stats.avgSpeed || '-';
    document.getElementById('distance').textContent = stats.distance || '-';
    document.getElementById('duration').textContent = stats.duration || '-';
    document.getElementById('points').textContent = stats.count || '-';
    document.getElementById('elevation').textContent = stats.elevation || '-';
}

/* ===== TOOLS ===== */
function calculateDistance(pts) {
    let d = 0;
    const R = 6371;
    for(let i=1; i<pts.length; i++) {
        const lat1 = pts[i-1].lat * Math.PI / 180;
        const lat2 = pts[i].lat * Math.PI / 180;
        const dLat = (pts[i].lat - pts[i-1].lat) * Math.PI / 180;
        const dLon = (pts[i].lon - pts[i-1].lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        d += R * c;
    }
    return d;
}

function formatMs(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}

/* ===== GRAFICO ===== */
function renderChart(file) {
    const ctx = document.getElementById('activityChart').getContext('2d');
    
    if (chart) chart.destroy();
    
    const step = Math.max(1, Math.floor(file.points.length / 200));
    const sampled = file.points.filter((_, i) => i % step === 0);
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sampled.map((_, i) => i),
            datasets: [
                {
                    label: 'Elevazione (m)',
                    data: sampled.map(p => p.ele),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    yAxisID: 'y',
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    label: 'Potenza (W)',
                    data: sampled.map(p => p.pwr),
                    borderColor: '#ef4444',
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { display: false },
                y: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    grid: { display: false }
                }
            }
        }
    });
}

/* ===== EXPORT & PREVIEW ===== */
function updatePreview() {
    if (currentFileIndex === -1) return;
    
    const file = activeFiles[currentFileIndex];
    const currPwr = file.stats.avgPower || 1;
    const currSpd = file.stats.avgSpeed || 1;
    const targetPwr = parseInt(state.targetWatt) || currPwr;
    const targetSpd = parseFloat(state.targetSpeed) || currSpd;
    
    let text = "";
    
    if (state.editMode !== 'speed' && file.stats.avgPower > 0) {
        const pDiff = (((targetPwr / currPwr) - 1) * 100).toFixed(1);
        text += `Watt: ${pDiff > 0 ? '+' : ''}${pDiff}% | `;
    }
    
    if (state.editMode !== 'watt') {
        const sDiff = (((targetSpd / currSpd) - 1) * 100).toFixed(1);
        const timeChange = (1 / (targetSpd / currSpd) - 1) * 100;
        text += `Tempo: ${timeChange > 0 ? '+' : ''}${timeChange.toFixed(1)}% (Velocità)`;
    }
    
    document.getElementById('previewText').textContent = text || "Nessuna modifica";
}

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
    const currPwr = file.stats.avgPower || 1;
    const currSpd = file.stats.avgSpeed || 1;
    const targetPwr = parseInt(state.targetWatt) || currPwr;
    const targetSpd = parseFloat(state.targetSpeed) || currSpd;
    
    const pFactor = targetPwr / currPwr;
    const tFactor = currSpd / targetSpd;
    
    const newXml = file.xml.cloneNode(true);
    const trks = newXml.querySelectorAll('trkpt');
    
    let startTime = new Date(trks[0].querySelector('time').textContent).getTime();
    let lastOrigTime = startTime;
    let currentNewTime = startTime;
    
    trks.forEach((pt, i) => {
        if (state.editMode !== 'speed') {
            const pNode = pt.querySelector('power, PowerInWatts');
            if (pNode) pNode.textContent = Math.round(parseInt(pNode.textContent) * pFactor);
        }
        
        if (state.editMode !== 'watt' && i > 0) {
            const timeNode = pt.querySelector('time');
            const origTime = new Date(timeNode.textContent).getTime();
            const diff = origTime - lastOrigTime;
            currentNewTime += (diff * tFactor);
            timeNode.textContent = new Date(currentNewTime).toISOString();
            lastOrigTime = origTime;
        }
    });
    
    const blob = new Blob([new XMLSerializer().serializeToString(newXml)], {type: 'text/xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace('.gpx', '')}_modified.gpx`;
    a.click();
    
    showToast("File GPX esportato con successo!");
}

function exportFIT(file) {
    const currPwr = file.stats.avgPower || 1;
    const currSpd = file.stats.avgSpeed || 1;
    const targetPwr = parseInt(state.targetWatt) || currPwr;
    const targetSpd = parseFloat(state.targetSpeed) || currSpd;
    
    const pFactor = targetPwr / currPwr;
    const tFactor = currSpd / targetSpd;
    
    // Clone fitData
    const newFitData = JSON.parse(JSON.stringify(file.fitData));
    
    // Modify records
    if (newFitData.records && newFitData.records.length > 0) {
        let startTimestamp = new Date(newFitData.records[0].timestamp).getTime();
        let lastOrigTime = startTimestamp;
        let currentNewTime = startTimestamp;
        
        newFitData.records.forEach((rec, i) => {
            // Modify power
            if (state.editMode !== 'speed' && rec.power) {
                rec.power = Math.round(rec.power * pFactor);
            }
            
            // Modify timestamps (speed adjustment)
            if (state.editMode !== 'watt' && i > 0) {
                const origTime = new Date(rec.timestamp).getTime();
                const diff = origTime - lastOrigTime;
                currentNewTime += (diff * tFactor);
                rec.timestamp = new Date(currentNewTime).toISOString();
                lastOrigTime = origTime;
            }
        });
    }
    
    // Update session data
    if (newFitData.sessions && newFitData.sessions.length > 0) {
        newFitData.sessions.forEach(session => {
            if (state.editMode !== 'speed' && session.avg_power) {
                session.avg_power = Math.round(session.avg_power * pFactor);
            }
            if (state.editMode !== 'watt' && session.total_elapsed_time) {
                session.total_elapsed_time = Math.round(session.total_elapsed_time * tFactor);
                session.total_timer_time = Math.round(session.total_timer_time * tFactor);
            }
            if (state.editMode !== 'watt' && session.avg_speed) {
                session.avg_speed = session.avg_speed / tFactor;
            }
        });
    }
    
    // Build FIT file using FitParser builder
    try {
        const fitBuilder = FitParser.builder();
        
        // Write file_id message
        if (newFitData.file_id) {
            fitBuilder.writeMessage('file_id', newFitData.file_id);
        }
        
        // Write records
        newFitData.records.forEach(rec => {
            fitBuilder.writeMessage('record', rec);
        });
        
        // Write session
        if (newFitData.sessions) {
            newFitData.sessions.forEach(session => {
                fitBuilder.writeMessage('session', session);
            });
        }
        
        // Write activity
        if (newFitData.activity) {
            fitBuilder.writeMessage('activity', newFitData.activity);
        }
        
        const fitArrayBuffer = fitBuilder.build();
        const blob = new Blob([fitArrayBuffer], {type: 'application/octet-stream'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name.replace('.fit', '')}_modified.fit`;
        a.click();
        
        showToast("File FIT esportato con successo!");
    } catch (err) {
        console.error('Export FIT Error:', err);
        showToast("Errore nell'esportazione FIT. Usa GPX per ora.", "danger");
    }
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = type === 'success' ? 'var(--success)' : (type === 'warning' ? 'var(--warning)' : 'var(--danger)');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
