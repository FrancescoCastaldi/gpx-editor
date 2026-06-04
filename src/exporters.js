const GPXTPX_NS = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1';

function removeByLocalName(parent, localNames) {
    if (!parent) return;
    const toRemove = [];
    const all = parent.getElementsByTagName('*');
    for (const el of all) {
        if (localNames.includes(el.localName)) {
            toRemove.push(el);
        }
    }
    toRemove.forEach(el => el.remove());
}

function findTrackPointExtension(ext) {
    if (!ext) return null;
    for (const child of ext.children) {
        if (child.localName === 'TrackPointExtension') {
            return child;
        }
    }
    return null;
}

function ensureGpxTpxNamespace(xml) {
    const root = xml.documentElement;
    if (!root.getAttribute('xmlns:gpxtpx')) {
        root.setAttribute('xmlns:gpxtpx', GPXTPX_NS);
    }
}

export function exportGPX(file) {
    const xml = file.xml;
    const pts = xml.querySelectorAll('trkpt');

    ensureGpxTpxNamespace(xml);

    const gpxNs = xml.documentElement.namespaceURI;

    const powerTags = ['power', 'PowerInWatts', 'watts'];
    const hrTags = ['hr', 'heartrate', 'HeartRateBpm', 'bpm'];
    const cadTags = ['cad', 'cadence'];
    const speedTags = ['speed'];
    const allTags = [...powerTags, ...hrTags, ...cadTags, ...speedTags];

    const createNode = (tag) => {
        return gpxNs ? xml.createElementNS(gpxNs, tag) : xml.createElement(tag);
    };

    pts.forEach((pt, i) => {
        const p = file.points[i];
        if (!p) return;

        let ext = pt.querySelector('extensions');
        if (!ext) {
            ext = createNode('extensions');
            pt.appendChild(ext);
        }

        removeByLocalName(ext, allTags);

        if (p.pwr != null) {
            const node = createNode('power');
            node.textContent = p.pwr;
            ext.appendChild(node);
        }

        let tpe = findTrackPointExtension(ext);
        const needsTpe = p.hr != null || p.cadence != null || p.speed != null;

        if (needsTpe && !tpe) {
            tpe = xml.createElementNS(GPXTPX_NS, 'gpxtpx:TrackPointExtension');
            ext.appendChild(tpe);
        }

        if (tpe) {
            removeByLocalName(tpe, allTags);

            if (p.hr != null) {
                const node = xml.createElementNS(GPXTPX_NS, 'gpxtpx:hr');
                node.textContent = p.hr;
                tpe.appendChild(node);
            }
            if (p.cadence != null) {
                const node = xml.createElementNS(GPXTPX_NS, 'gpxtpx:cad');
                node.textContent = Math.round(p.cadence);
                tpe.appendChild(node);
            }
            if (p.speed != null) {
                const node = xml.createElementNS(GPXTPX_NS, 'gpxtpx:speed');
                node.textContent = p.speed;
                tpe.appendChild(node);
            }

            if (tpe.children.length === 0 && tpe.parentNode) {
                tpe.remove();
            }
        }
    });

    const str = new XMLSerializer().serializeToString(xml);
    downloadBlob(
        new Blob([str], { type: 'application/gpx+xml' }),
        file.name.replace('.gpx', '_modified.gpx')
    );
}

export function exportFIT(file) {
    if (!file.modified) {
        file.raw.arrayBuffer().then(buf => {
            downloadBlob(
                new Blob([buf], { type: 'application/octet-stream' }),
                file.name
            );
        });
        return;
    }
    exportFITasGPX(file);
}

export function exportFITasGPX(file) {
    const doc = document.implementation.createDocument(null, 'gpx', null);
    const gpx = doc.documentElement;
    gpx.setAttribute('version', '1.1');
    gpx.setAttribute('creator', 'CycleEdit');
    gpx.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1');
    gpx.setAttribute('xmlns:gpxtpx', GPXTPX_NS);
    gpx.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
    gpx.setAttribute('xsi:schemaLocation',
        'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd');

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
        const tpe = doc.createElementNS(GPXTPX_NS, 'gpxtpx:TrackPointExtension');
        let hasExt = false;

        if (p.pwr != null) { appendEl('power', p.pwr, ext); hasExt = true; }
        if (p.hr != null) {
            const node = doc.createElementNS(GPXTPX_NS, 'gpxtpx:hr');
            node.textContent = p.hr;
            tpe.appendChild(node);
            hasExt = true;
        }
        if (p.cadence != null) {
            const node = doc.createElementNS(GPXTPX_NS, 'gpxtpx:cad');
            node.textContent = Math.round(p.cadence);
            tpe.appendChild(node);
            hasExt = true;
        }
        if (p.speed != null) {
            const node = doc.createElementNS(GPXTPX_NS, 'gpxtpx:speed');
            node.textContent = p.speed;
            tpe.appendChild(node);
            hasExt = true;
        }
        if (p.temperature != null) {
            const node = doc.createElementNS(GPXTPX_NS, 'gpxtpx:atemp');
            node.textContent = p.temperature;
            tpe.appendChild(node);
            hasExt = true;
        }

        if (hasExt) {
            if (tpe.children.length > 0) ext.appendChild(tpe);
            trkpt.appendChild(ext);
        }
        trkseg.appendChild(trkpt);
    });

    const str = new XMLSerializer().serializeToString(doc);
    downloadBlob(
        new Blob([str], { type: 'application/gpx+xml' }),
        file.name.replace('.fit', '_modified.gpx')
    );
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
