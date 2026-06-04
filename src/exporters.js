export function exportGPX(file) {
    const xml = file.xml;
    const pts = xml.querySelectorAll('trkpt');

    pts.forEach((pt, i) => {
        const p = file.points[i];
        if (!p) return;

        let ext = pt.querySelector('extensions');
        if (!ext) {
            ext = xml.createElement('extensions');
            pt.appendChild(ext);
        }

        const oldTags = [
            'power', 'PowerInWatts', 'watts', 'gpxtpx:Power',
            'hr', 'heartrate', 'HeartRateBpm', 'bpm', 'gpxtpx:hr',
            'cad', 'cadence', 'gpxtpx:cad',
            'speed', 'gpxtpx:speed'
        ];
        oldTags.forEach(tag => {
            ext.querySelectorAll(tag).forEach(n => n.remove());
        });

        const setNode = (tag, val) => {
            const node = xml.createElement(tag);
            node.textContent = val;
            ext.appendChild(node);
        };

        if (p.pwr != null) setNode('power', p.pwr);
        if (p.hr != null) setNode('hr', p.hr);
        if (p.cadence != null) setNode('cad', Math.round(p.cadence));
        if (p.speed != null) setNode('speed', p.speed);
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

        if (hasExt) {
            ext.appendChild(tpe);
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
