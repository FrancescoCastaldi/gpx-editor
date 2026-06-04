import { describe, it, expect } from 'vitest';
import {
    haversine,
    calcDistance,
    calcElevation,
    calcDescent,
    calcDuration,
    formatDuration,
    avg,
    max,
    calcNP,
    calcGPXSpeed,
    computeStats
} from '../src/utils.js';

describe('haversine', () => {
    it('returns 0 for identical points', () => {
        expect(haversine(45.0, 9.0, 45.0, 9.0)).toBe(0);
    });

    it('calculates distance between two known points', () => {
        const dist = haversine(45.4642, 9.1900, 41.9028, 12.4964);
        expect(dist).toBeGreaterThan(470);
        expect(dist).toBeLessThan(490);
    });

    it('handles negative coordinates', () => {
        const dist = haversine(-33.8688, 151.2093, -37.8136, 144.9631);
        expect(dist).toBeGreaterThan(700);
        expect(dist).toBeLessThan(720);
    });
});

describe('calcDistance', () => {
    it('returns 0 for empty array', () => {
        expect(calcDistance([])).toBe(0);
    });

    it('returns 0 for single point', () => {
        expect(calcDistance([{ lat: 45, lon: 9 }])).toBe(0);
    });

    it('calculates total distance for multiple points', () => {
        const points = [
            { lat: 45.0, lon: 9.0 },
            { lat: 45.01, lon: 9.01 },
            { lat: 45.02, lon: 9.02 }
        ];
        const dist = calcDistance(points);
        expect(dist).toBeGreaterThan(0);
    });

    it('skips points with null coordinates', () => {
        const points = [
            { lat: 45.0, lon: 9.0 },
            { lat: null, lon: null },
            { lat: 45.01, lon: 9.01 }
        ];
        const dist = calcDistance(points);
        expect(dist).toBe(0);
    });
});

describe('calcElevation', () => {
    it('returns 0 for empty array', () => {
        expect(calcElevation([])).toBe(0);
    });

    it('calculates total ascent', () => {
        const points = [
            { ele: 100 }, { ele: 150 }, { ele: 120 }, { ele: 200 }
        ];
        expect(calcElevation(points)).toBe(130);
    });

    it('handles null elevation values', () => {
        const points = [
            { ele: null }, { ele: 100 }, { ele: 150 }
        ];
        expect(calcElevation(points)).toBe(150);
    });
});

describe('calcDescent', () => {
    it('returns 0 for empty array', () => {
        expect(calcDescent([])).toBe(0);
    });

    it('calculates total descent', () => {
        const points = [
            { ele: 200 }, { ele: 150 }, { ele: 180 }, { ele: 100 }
        ];
        expect(calcDescent(points)).toBe(130);
    });

    it('returns 0 for only ascending points', () => {
        const points = [
            { ele: 100 }, { ele: 150 }, { ele: 200 }
        ];
        expect(calcDescent(points)).toBe(0);
    });
});

describe('formatDuration', () => {
    it('formats zero seconds', () => {
        expect(formatDuration(0)).toBe('0:00:00');
    });

    it('formats hours, minutes, seconds', () => {
        expect(formatDuration(3661)).toBe('1:01:01');
    });

    it('formats large durations', () => {
        expect(formatDuration(86399)).toBe('23:59:59');
    });

    it('pads minutes and seconds', () => {
        expect(formatDuration(3605)).toBe('1:00:05');
    });
});

describe('calcDuration', () => {
    it('returns 0:00:00 for empty array', () => {
        expect(calcDuration([])).toBe('0:00:00');
    });

    it('returns 0:00:00 for single point', () => {
        expect(calcDuration([{ time: new Date('2024-01-01T10:00:00Z') }])).toBe('0:00:00');
    });

    it('calculates duration between first and last point', () => {
        const points = [
            { time: new Date('2024-01-01T10:00:00Z') },
            { time: new Date('2024-01-01T11:30:45Z') }
        ];
        expect(calcDuration(points)).toBe('1:30:45');
    });
});

describe('avg', () => {
    it('returns null for empty array', () => {
        expect(avg([], 'pwr')).toBeNull();
    });

    it('returns null when all values are null', () => {
        expect(avg([{ pwr: null }, { pwr: null }], 'pwr')).toBeNull();
    });

    it('calculates average ignoring nulls', () => {
        const points = [{ pwr: 100 }, { pwr: null }, { pwr: 200 }];
        expect(avg(points, 'pwr')).toBe(150);
    });

    it('rounds the result', () => {
        const points = [{ pwr: 100 }, { pwr: 101 }, { pwr: 102 }];
        expect(avg(points, 'pwr')).toBe(101);
    });
});

describe('max', () => {
    it('returns null for empty array', () => {
        expect(max([], 'pwr')).toBeNull();
    });

    it('returns null when all values are null', () => {
        expect(max([{ pwr: null }], 'pwr')).toBeNull();
    });

    it('returns the maximum value', () => {
        const points = [{ pwr: 100 }, { pwr: 350 }, { pwr: 200 }];
        expect(max(points, 'pwr')).toBe(350);
    });
});

describe('calcNP', () => {
    it('returns null for fewer than 30 power values', () => {
        const points = Array.from({ length: 29 }, (_, i) => ({ pwr: 200 + i }));
        expect(calcNP(points)).toBeNull();
    });

    it('calculates normalized power for 30+ values', () => {
        const points = Array.from({ length: 100 }, () => ({ pwr: 200 }));
        const np = calcNP(points);
        expect(np).toBe(200);
    });

    it('NP is higher than average for variable power', () => {
        const points = [];
        for (let i = 0; i < 120; i++) {
            points.push({ pwr: i < 60 ? 100 : 300 });
        }
        const np = calcNP(points);
        const average = avg(points, 'pwr');
        expect(np).toBeGreaterThan(average);
    });

    it('ignores null power values', () => {
        const points = Array.from({ length: 50 }, (_, i) => ({
            pwr: i % 3 === 0 ? null : 200
        }));
        const np = calcNP(points);
        expect(np).toBe(200);
    });
});

describe('calcGPXSpeed', () => {
    it('calculates speed for points without speed', () => {
        const points = [
            { lat: 45.0, lon: 9.0, time: new Date('2024-01-01T10:00:00Z'), speed: null },
            { lat: 45.01, lon: 9.01, time: new Date('2024-01-01T10:00:10Z'), speed: null }
        ];
        calcGPXSpeed(points);
        expect(points[1].speed).not.toBeNull();
        expect(points[1].speed).toBeGreaterThan(0);
    });

    it('does not overwrite existing speed values', () => {
        const points = [
            { lat: 45.0, lon: 9.0, time: new Date('2024-01-01T10:00:00Z'), speed: null },
            { lat: 45.01, lon: 9.01, time: new Date('2024-01-01T10:00:10Z'), speed: 25.5 }
        ];
        calcGPXSpeed(points);
        expect(points[1].speed).toBe(25.5);
    });

    it('skips points with null coordinates', () => {
        const points = [
            { lat: 45.0, lon: 9.0, time: new Date('2024-01-01T10:00:00Z'), speed: null },
            { lat: null, lon: null, time: new Date('2024-01-01T10:00:10Z'), speed: null }
        ];
        calcGPXSpeed(points);
        expect(points[1].speed).toBeNull();
    });
});

describe('computeStats', () => {
    const basePoints = [
        { lat: 45.0, lon: 9.0, ele: 100, time: new Date('2024-01-01T10:00:00Z'), pwr: 200, hr: 140, cadence: 85, speed: 30 },
        { lat: 45.01, lon: 9.01, ele: 150, time: new Date('2024-01-01T10:30:00Z'), pwr: 250, hr: 155, cadence: 90, speed: 28 },
        { lat: 45.02, lon: 9.02, ele: 120, time: new Date('2024-01-01T11:00:00Z'), pwr: 180, hr: 135, cadence: 80, speed: 32 }
    ];

    it('computes stats from points when no session data', () => {
        const fileData = {
            points: basePoints,
            sessions: []
        };
        const stats = computeStats(fileData);
        expect(stats.distance).toBeDefined();
        expect(stats.duration).toBe('1:00:00');
        expect(stats.totalAscent).toBe(50);
        expect(stats.totalDescent).toBe(30);
        expect(stats.avgPower).toBe(210);
        expect(stats.maxPower).toBe(250);
        expect(stats.avgHR).toBe(143);
        expect(stats.maxHR).toBe(155);
        expect(stats.avgCadence).toBe(85);
    });

    it('uses session data when available', () => {
        const fileData = {
            points: basePoints,
            sessions: [{
                totalDistance: 50000,
                totalTimerTime: 7200,
                totalAscent: 500,
                totalDescent: 400,
                avgSpeed: 8.33,
                maxSpeed: 15.0,
                avgPower: 220,
                maxPower: 400,
                normalizedPower: 235,
                avgHeartRate: 148,
                maxHeartRate: 175,
                avgCadence: 88,
                totalCalories: 1200,
                trainingStressScore: 75.5,
                intensityFactor: 0.85,
                totalWork: 1500000
            }]
        };
        const stats = computeStats(fileData);
        expect(stats.distance).toBe('50.00');
        expect(stats.duration).toBe('2:00:00');
        expect(stats.totalAscent).toBe(500);
        expect(stats.avgPower).toBe(220);
        expect(stats.maxPower).toBe(400);
        expect(stats.normalizedPower).toBe(235);
        expect(stats.totalCalories).toBe(1200);
        expect(stats.tss).toBe(76);
        expect(stats.intensityFactor).toBe('0.85');
        expect(stats.totalWork).toBe(1500);
    });

    it('handles empty points array', () => {
        const fileData = { points: [], sessions: [] };
        const stats = computeStats(fileData);
        expect(stats.distance).toBe('0.00');
        expect(stats.duration).toBe('0:00:00');
        expect(stats.avgPower).toBeNull();
    });
});
