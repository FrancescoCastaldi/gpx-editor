import { parseGPX, parseFIT, createFileData } from './parsers.js';
import { exportGPX, exportFIT } from './exporters.js';
import {
    initMap, showEditor, showLoading, showToast,
    renderPreviewList, renderStats, renderChart, renderMap,
    renderMetricButtons, configurePowerSlider
} from './ui.js';

let activeFiles = [];
let currentFileIndex = -1;
let activeChartMetric = 'pwr';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated') {
                        window.location.reload();
                    }
                });
            }
        });
    }).catch(() => {});
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
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            handleFiles(e.dataTransfer.files);
        };
    }

    if (fileInput) fileInput.onchange = (e) => handleFiles(e.target.files);

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.onclick = exportCurrentFile;

    const targetSlider = document.getElementById('powerTargetSlider');
    if (targetSlider) {
        targetSlider.oninput = (e) => {
            const targetAvg = parseInt(e.target.value);
            document.getElementById('powerTargetDisplay').textContent = targetAvg + ' W';
            applyProportionalPower(targetAvg);
        };
        targetSlider.disabled = true;
    }

    document.addEventListener('click', (e) => {
        if (!e.target.matches('[data-metric]')) return;
        activeChartMetric = e.target.dataset.metric;
        document.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderChart(activeFiles[currentFileIndex], activeChartMetric);
    });

    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    let currentTheme = 'dark';

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            if (themeIcon) {
                themeIcon.innerHTML = currentTheme === 'dark'
                    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
                    : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
            }
        });
    }

    const addFileBtn = document.getElementById('addFileBtn');
    const fileInput2 = document.getElementById('fileInput2');

    if (addFileBtn) {
        addFileBtn.addEventListener('click', () => {
            if (fileInput2) fileInput2.click();
        });
    }

    if (fileInput2) {
        fileInput2.addEventListener('change', e => {
            if (e.target.files[0]) handleFiles(e.target.files);
        });
    }
}

async function handleFiles(files) {
    showLoading(true);

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'gpx' && ext !== 'fit') {
            showToast(`Formato non supportato: ${ext}`);
            continue;
        }

        const fileData = createFileData(file);

        try {
            if (ext === 'gpx') {
                await parseGPX(fileData);
            } else {
                await parseFIT(fileData);
            }
            activeFiles.push(fileData);
        } catch (err) {
            console.error('Parse error:', err);
            showToast(`Errore: ${file.name} - ${err.message}`);
        }
    }

    if (activeFiles.length > 0) {
        currentFileIndex = activeFiles.length - 1;
        updateUI();
    }

    showLoading(false);
}

function updateUI() {
    showEditor();
    renderPreviewList(activeFiles, currentFileIndex, selectFile);
    renderActiveFile();

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.disabled = false;
}

function selectFile(index) {
    currentFileIndex = index;
    renderPreviewList(activeFiles, currentFileIndex, selectFile);
    renderActiveFile();
}

function renderActiveFile() {
    const file = activeFiles[currentFileIndex];
    if (!file) return;

    configurePowerSlider(file);

    const { hasPwr } = renderMetricButtons(file, activeChartMetric);
    if (!hasPwr && activeChartMetric === 'pwr') {
        activeChartMetric = 'ele';
        renderMetricButtons(file, activeChartMetric);
    }

    renderStats(file);
    renderChart(file, activeChartMetric);
    renderMap(file);
}

function applyProportionalPower(targetAvg) {
    const file = activeFiles[currentFileIndex];
    if (!file) return;

    const origVals = file.originalPower.filter(v => v != null);
    if (!origVals.length) return;
    const originalAvg = Math.round(origVals.reduce((a, b) => a + b, 0) / origVals.length);
    if (!originalAvg || originalAvg === 0) return;

    const delta = targetAvg - originalAvg;

    file.points.forEach((point, index) => {
        const originalPower = file.originalPower[index];
        if (originalPower !== null) {
            point.pwr = originalPower + delta;
        }
    });

    file.modified = (delta !== 0);
    if (activeChartMetric === 'pwr') renderChart(file, activeChartMetric);
    renderStats(file);
}

function exportCurrentFile() {
    const file = activeFiles[currentFileIndex];
    if (!file) return;
    file.ext === 'gpx' ? exportGPX(file) : exportFIT(file);
    showToast('Esportazione completata');
}
