// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

describe('GPX parsing with namespace prefixes', () => {
    let parseGPX, createFileData;

    beforeAll(async () => {
        const mod = await import('../src/parsers.js');
        parseGPX = mod.parseGPX;
        createFileData = mod.createFileData;
    });

    it('parses Strava-style GPX with ns3: prefix', async () => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><trkseg>
    <trkpt lat="45.4642" lon="9.1900">
      <ele>120</ele>
      <time>2024-01-01T10:00:00Z</time>
      <extensions>
        <power>200</power>
        <ns3:TrackPointExtension>
          <ns3:hr>145</ns3:hr>
          <ns3:cad>85</ns3:cad>
        </ns3:TrackPointExtension>
      </extensions>
    </trkpt>
    <trkpt lat="45.4650" lon="9.1910">
      <ele>125</ele>
      <time>2024-01-01T10:00:01Z</time>
      <extensions>
        <power>210</power>
        <ns3:TrackPointExtension>
          <ns3:hr>148</ns3:hr>
          <ns3:cad>88</ns3:cad>
        </ns3:TrackPointExtension>
      </extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

        const fileData = createFileData({ name: 'strava.gpx', text: () => Promise.resolve(gpx) });
        await parseGPX(fileData);

        expect(fileData.points).toHaveLength(2);
        expect(fileData.points[0].pwr).toBe(200);
        expect(fileData.points[0].hr).toBe(145);
        expect(fileData.points[0].cadence).toBe(85);
        expect(fileData.points[1].pwr).toBe(210);
        expect(fileData.points[1].hr).toBe(148);
        expect(fileData.points[1].cadence).toBe(88);
    });

    it('parses Garmin-style GPX with gpxtpx: prefix', async () => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><trkseg>
    <trkpt lat="45.0" lon="9.0">
      <ele>100</ele>
      <time>2024-01-01T10:00:00Z</time>
      <extensions>
        <power>250</power>
        <gpxtpx:TrackPointExtension>
          <gpxtpx:hr>155</gpxtpx:hr>
          <gpxtpx:cad>90</gpxtpx:cad>
        </gpxtpx:TrackPointExtension>
      </extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

        const fileData = createFileData({ name: 'garmin.gpx', text: () => Promise.resolve(gpx) });
        await parseGPX(fileData);

        expect(fileData.points).toHaveLength(1);
        expect(fileData.points[0].pwr).toBe(250);
        expect(fileData.points[0].hr).toBe(155);
        expect(fileData.points[0].cadence).toBe(90);
    });

    it('parses GPX without namespace prefixes', async () => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx>
  <trk><trkseg>
    <trkpt lat="45.0" lon="9.0">
      <ele>100</ele>
      <time>2024-01-01T10:00:00Z</time>
      <extensions>
        <power>180</power>
        <hr>140</hr>
        <cad>80</cad>
      </extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

        const fileData = createFileData({ name: 'basic.gpx', text: () => Promise.resolve(gpx) });
        await parseGPX(fileData);

        expect(fileData.points).toHaveLength(1);
        expect(fileData.points[0].pwr).toBe(180);
        expect(fileData.points[0].hr).toBe(140);
        expect(fileData.points[0].cadence).toBe(80);
    });
});

describe('GPX export with namespace handling', () => {
    let parseGPX, createFileData, exportGPX;

    beforeAll(async () => {
        const parsers = await import('../src/parsers.js');
        const exporters = await import('../src/exporters.js');
        parseGPX = parsers.parseGPX;
        createFileData = parsers.createFileData;
        exportGPX = exporters.exportGPX;
    });

    function captureExport(fileData) {
        return new Promise((resolve) => {
            const origCreateObjectURL = URL.createObjectURL;
            const origRevokeObjectURL = URL.revokeObjectURL;

            global.URL.createObjectURL = () => 'blob:test';
            global.URL.revokeObjectURL = () => {};

            const origClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {};

            exportGPX(fileData);

            const str = new XMLSerializer().serializeToString(fileData.xml);

            global.URL.createObjectURL = origCreateObjectURL;
            global.URL.revokeObjectURL = origRevokeObjectURL;
            HTMLAnchorElement.prototype.click = origClick;

            resolve(str);
        });
    }

    it('exports modified power values in Strava-style GPX', async () => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><trkseg>
    <trkpt lat="45.0" lon="9.0">
      <ele>100</ele>
      <time>2024-01-01T10:00:00Z</time>
      <extensions>
        <power>200</power>
        <ns3:TrackPointExtension>
          <ns3:hr>145</ns3:hr>
          <ns3:cad>85</ns3:cad>
        </ns3:TrackPointExtension>
      </extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

        const fileData = createFileData({ name: 'strava.gpx', text: () => Promise.resolve(gpx) });
        await parseGPX(fileData);

        fileData.points[0].pwr = 300;
        fileData.points[0].hr = 160;
        fileData.modified = true;

        const exported = captureExport(fileData);
        const str = await exported;

        expect(str).toContain('<power>300</power>');
        expect(str).toContain('160');
        expect(str).not.toContain('<power>200</power>');
    });

    it('adds gpxtpx namespace if missing', async () => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="45.0" lon="9.0">
      <ele>100</ele>
      <time>2024-01-01T10:00:00Z</time>
      <extensions>
        <power>200</power>
      </extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

        const fileData = createFileData({ name: 'no-ns.gpx', text: () => Promise.resolve(gpx) });
        await parseGPX(fileData);

        fileData.points[0].hr = 150;
        fileData.modified = true;

        const str = await captureExport(fileData);
        expect(str).toContain('xmlns:gpxtpx');
        expect(str).toContain('TrackPointExtension');
    });
});

describe('applyProportionalPower uses additive approach', () => {
    it('adds delta to all power points (not multiplicative)', async () => {
        const { createFileData, parseGPX } = await import('../src/parsers.js');

        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx>
  <trk><trkseg>
    <trkpt lat="45.0" lon="9.0">
      <ele>100</ele>
      <time>2024-01-01T10:00:00Z</time>
      <extensions><power>200</power></extensions>
    </trkpt>
    <trkpt lat="45.01" lon="9.01">
      <ele>110</ele>
      <time>2024-01-01T10:00:01Z</time>
      <extensions><power>300</power></extensions>
    </trkpt>
    <trkpt lat="45.02" lon="9.02">
      <ele>120</ele>
      <time>2024-01-01T10:00:02Z</time>
      <extensions><power>400</power></extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

        const fileData = createFileData({ name: 'test.gpx', text: () => Promise.resolve(gpx) });
        await parseGPX(fileData);

        expect(fileData.originalPower).toEqual([200, 300, 400]);
        const originalAvg = Math.round((200 + 300 + 400) / 3);
        expect(originalAvg).toBe(300);

        const targetAvg = 350;
        const delta = targetAvg - originalAvg;
        expect(delta).toBe(50);

        fileData.points.forEach((point, index) => {
            const originalPower = fileData.originalPower[index];
            if (originalPower !== null) {
                point.pwr = originalPower + delta;
            }
        });

        expect(fileData.points[0].pwr).toBe(250);
        expect(fileData.points[1].pwr).toBe(350);
        expect(fileData.points[2].pwr).toBe(450);

        const newAvg = Math.round((250 + 350 + 450) / 3);
        expect(newAvg).toBe(350);
        expect(newAvg).toBe(targetAvg);

        expect(fileData.points[2].pwr).toBe(450);
        expect(fileData.points[2].pwr).toBeLessThan(600);
    });
});
