import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFileData } from '../src/parsers.js';

describe('createFileData', () => {
    it('creates correct structure for GPX file', () => {
        const mockFile = { name: 'activity.gpx' };
        const fd = createFileData(mockFile);

        expect(fd.name).toBe('activity.gpx');
        expect(fd.ext).toBe('gpx');
        expect(fd.raw).toBe(mockFile);
        expect(fd.points).toEqual([]);
        expect(fd.originalPower).toEqual([]);
        expect(fd.originalHR).toEqual([]);
        expect(fd.originalCadence).toEqual([]);
        expect(fd.originalSpeed).toEqual([]);
        expect(fd.originalSessionPower).toBeNull();
        expect(fd.sessions).toEqual([]);
        expect(fd.laps).toEqual([]);
        expect(fd.deviceInfo).toEqual([]);
        expect(fd.fitRaw).toBeNull();
        expect(fd.xml).toBeNull();
        expect(fd.modified).toBe(false);
    });

    it('creates correct structure for FIT file', () => {
        const mockFile = { name: 'ride.fit' };
        const fd = createFileData(mockFile);

        expect(fd.name).toBe('ride.fit');
        expect(fd.ext).toBe('fit');
    });

    it('handles files with multiple dots in name', () => {
        const mockFile = { name: 'my.ride.2024.gpx' };
        const fd = createFileData(mockFile);

        expect(fd.ext).toBe('gpx');
    });

    it('handles uppercase extensions', () => {
        const mockFile = { name: 'activity.GPX' };
        const fd = createFileData(mockFile);

        expect(fd.ext).toBe('gpx');
    });
});

describe('parseGPX', () => {
    let parseGPX;

    beforeEach(async () => {
        const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));
        if (!JSDOM) return;

        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        global.DOMParser = dom.window.DOMParser;
        global.XMLSerializer = dom.window.XMLSerializer;

        const mod = await import('../src/parsers.js');
        parseGPX = mod.parseGPX;
    });

    it('parses a valid GPX file with power, HR, cadence', async () => {
        if (!parseGPX) return;

        const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="45.4642" lon="9.1900">
        <ele>120</ele>
        <time>2024-01-01T10:00:00Z</time>
        <extensions>
          <power>200</power>
          <hr>145</hr>
          <cad>85</cad>
        </extensions>
      </trkpt>
      <trkpt lat="45.4650" lon="9.1910">
        <ele>125</ele>
        <time>2024-01-01T10:00:01Z</time>
        <extensions>
          <power>210</power>
          <hr>148</hr>
          <cad>88</cad>
        </extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

        const mockFile = {
            name: 'test.gpx',
            text: () => Promise.resolve(gpxContent)
        };

        const fileData = createFileData(mockFile);
        await parseGPX(fileData);

        expect(fileData.points).toHaveLength(2);
        expect(fileData.points[0].lat).toBeCloseTo(45.4642);
        expect(fileData.points[0].lon).toBeCloseTo(9.19);
        expect(fileData.points[0].ele).toBe(120);
        expect(fileData.points[0].pwr).toBe(200);
        expect(fileData.points[0].hr).toBe(145);
        expect(fileData.points[0].cadence).toBe(85);
        expect(fileData.points[1].pwr).toBe(210);
        expect(fileData.originalPower).toEqual([200, 210]);
    });

    it('parses GPX without extensions', async () => {
        if (!parseGPX) return;

        const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="45.0" lon="9.0">
        <ele>100</ele>
        <time>2024-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="45.01" lon="9.01">
        <ele>110</ele>
        <time>2024-01-01T10:00:10Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

        const mockFile = {
            name: 'basic.gpx',
            text: () => Promise.resolve(gpxContent)
        };

        const fileData = createFileData(mockFile);
        await parseGPX(fileData);

        expect(fileData.points).toHaveLength(2);
        expect(fileData.points[0].pwr).toBeNull();
        expect(fileData.points[0].hr).toBeNull();
        expect(fileData.points[0].cadence).toBeNull();
    });

    it('throws on empty GPX (no trackpoints)', async () => {
        if (!parseGPX) return;

        const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"><trk><trkseg></trkseg></trk></gpx>`;

        const mockFile = {
            name: 'empty.gpx',
            text: () => Promise.resolve(gpxContent)
        };

        const fileData = createFileData(mockFile);
        await expect(parseGPX(fileData)).rejects.toThrow('No trackpoints found');
    });
});
