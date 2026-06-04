import { calcGPXSpeed } from './utils.js';

const FIT_SDK_URL = 'https://esm.sh/@garmin/fitsdk@21.202.0';

export async function parseGPX(fileData) {
    const text = await fileData.raw.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');

    const parseError = xml.querySelector('parsererror');
    if (parseError) {
        throw new Error('Invalid GPX XML: ' + parseError.textContent);
    }

    fileData.xml = xml;

    xml.querySelectorAll('trkpt').forEach(pt => {
        const pwrStr = pt.querySelector('power, PowerInWatts')?.textContent;
        const hrStr = pt.querySelector('hr, heartrate, HeartRateBpm value, bpm')?.textContent;
        const cadStr = pt.querySelector('cad, cadence')?.textContent;
        const speedStr = pt.querySelector('speed')?.textContent;

        const point = {
            lat: parseFloat(pt.getAttribute('lat')),
            lon: parseFloat(pt.getAttribute('lon')),
            ele: parseFloat(pt.querySelector('ele')?.textContent || 0),
            time: new Date(pt.querySelector('time')?.textContent || Date.now()),
            pwr: pwrStr ? parseInt(pwrStr) : null,
            hr: hrStr ? parseInt(hrStr) : null,
            cadence: cadStr ? parseInt(cadStr) : null,
            speed: speedStr ? +(parseFloat(speedStr) * 3.6).toFixed(2) : null,
            distance: null,
            temperature: null
        };

        fileData.points.push(point);
        fileData.originalPower.push(point.pwr);
        fileData.originalHR.push(point.hr);
        fileData.originalCadence.push(point.cadence);
        fileData.originalSpeed.push(point.speed);
    });

    if (fileData.points.length === 0) {
        throw new Error('No trackpoints found in GPX file');
    }

    calcGPXSpeed(fileData.points);
}

export async function parseFIT(fileData) {
    const arrayBuffer = await fileData.raw.arrayBuffer();

    let Decoder, Stream;
    try {
        const sdk = await import(FIT_SDK_URL);
        Decoder = sdk.Decoder;
        Stream = sdk.Stream;
    } catch (err) {
        throw new Error(
            'Failed to load FIT SDK from CDN. Check your internet connection. ' +
            err.message
        );
    }

    const stream = Stream.fromArrayBuffer(arrayBuffer);

    if (!Decoder.isFIT(stream)) {
        throw new Error('Not a valid FIT file: missing .FIT header signature');
    }

    const decoder = new Decoder(stream);

    if (!decoder.checkIntegrity()) {
        console.warn('FIT file integrity check failed, attempting to read anyway');
    }

    const { messages, errors } = decoder.read();

    if (errors && errors.length > 0) {
        console.warn('FIT decode warnings:', errors);
    }

    fileData.fitRaw = messages;
    fileData.sessions = messages.sessionMesgs || [];
    fileData.laps = messages.lapMesgs || [];
    fileData.deviceInfo = messages.deviceInfoMesgs || [];

    if (fileData.sessions.length > 0) {
        const session = fileData.sessions[0];
        fileData.originalSessionPower = {
            avg: session.avgPower ?? null,
            max: session.maxPower ?? null,
            normalized: session.normalizedPower ?? null
        };
    }

    const records = messages.recordMesgs || [];
    if (records.length === 0) {
        throw new Error('No record messages found in FIT file');
    }

    records.forEach(r => {
        const rawCad = r.cadence != null ? r.cadence : 0;
        const fracCad = r.fractionalCadence != null ? r.fractionalCadence : 0;
        const cadence = rawCad + fracCad;
        const rawSpeed = r.enhancedSpeed ?? r.speed ?? null;

        const point = {
            lat: r.positionLat ?? null,
            lon: r.positionLong ?? null,
            ele: r.enhancedAltitude ?? r.altitude ?? 0,
            time: r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp),
            pwr: r.power ?? null,
            hr: r.heartRate ?? null,
            cadence: cadence > 0 ? cadence : null,
            speed: rawSpeed != null ? +(rawSpeed * 3.6).toFixed(2) : null,
            distance: r.distance != null ? r.distance / 1000 : null,
            temperature: r.temperature ?? null
        };

        fileData.points.push(point);
        fileData.originalPower.push(point.pwr);
        fileData.originalHR.push(point.hr);
        fileData.originalCadence.push(point.cadence);
        fileData.originalSpeed.push(point.speed);
    });
}

export function createFileData(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return {
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
        xml: null,
        modified: false
    };
}
