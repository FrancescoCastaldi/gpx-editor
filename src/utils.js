export function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calcDistance(points) {
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].lat == null || points[i - 1].lat == null) continue;
        dist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    return dist;
}

export function calcElevation(points) {
    let gain = 0;
    for (let i = 1; i < points.length; i++) {
        const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
        if (diff > 0) gain += diff;
    }
    return Math.round(gain);
}

export function calcDescent(points) {
    let loss = 0;
    for (let i = 1; i < points.length; i++) {
        const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
        if (diff < 0) loss += -diff;
    }
    return Math.round(loss);
}

export function calcDuration(points) {
    if (points.length < 2) return '0:00:00';
    return formatDuration((points[points.length - 1].time - points[0].time) / 1000);
}

export function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function avg(points, key) {
    const vals = points.map(p => p[key]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function max(points, key) {
    const vals = points.map(p => p[key]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    return Math.round(Math.max(...vals));
}

export function calcNP(points) {
    const pwrVals = points.map(p => p.pwr).filter(v => v != null);
    if (pwrVals.length < 30) return null;
    const windowSize = 30;
    const rolling = [];
    for (let i = windowSize - 1; i < pwrVals.length; i++) {
        const slice = pwrVals.slice(i - windowSize + 1, i + 1);
        rolling.push(slice.reduce((a, b) => a + b, 0) / windowSize);
    }
    return Math.round(
        (rolling.reduce((a, b) => a + b ** 4, 0) / rolling.length) ** 0.25
    );
}

export function calcGPXSpeed(points) {
    for (let i = 1; i < points.length; i++) {
        if (points[i].speed != null) continue;
        if (points[i].lat == null || points[i - 1].lat == null) continue;
        const distKm = haversine(
            points[i - 1].lat, points[i - 1].lon,
            points[i].lat, points[i].lon
        );
        const timeSec = (points[i].time - points[i - 1].time) / 1000;
        if (timeSec > 0) {
            points[i].speed = +(distKm / (timeSec / 3600)).toFixed(2);
        }
    }
}

export function computeStats(fileData) {
    const { points, sessions } = fileData;
    const s = sessions?.[0];

    const distanceKm = s?.totalDistance != null
        ? (s.totalDistance / 1000).toFixed(2)
        : calcDistance(points).toFixed(2);

    return {
        distance: distanceKm,
        duration: s?.totalTimerTime != null
            ? formatDuration(s.totalTimerTime)
            : calcDuration(points),
        totalAscent: s?.totalAscent ?? calcElevation(points),
        totalDescent: s?.totalDescent ?? calcDescent(points),
        avgSpeed: s?.avgSpeed != null
            ? (s.avgSpeed * 3.6).toFixed(1)
            : (avg(points, 'speed') != null ? avg(points, 'speed').toFixed(1) : null),
        maxSpeed: s?.maxSpeed != null
            ? (s.maxSpeed * 3.6).toFixed(1)
            : (max(points, 'speed') != null ? max(points, 'speed').toFixed(1) : null),
        avgPower: s?.avgPower ?? avg(points, 'pwr'),
        maxPower: s?.maxPower ?? max(points, 'pwr'),
        normalizedPower: s?.normalizedPower ?? calcNP(points),
        avgHR: s?.avgHeartRate ?? avg(points, 'hr'),
        maxHR: s?.maxHeartRate ?? max(points, 'hr'),
        avgCadence: s?.avgCadence ?? avg(points, 'cadence'),
        maxCadence: s?.maxCadence ?? max(points, 'cadence'),
        totalCalories: s?.totalCalories ?? null,
        tss: s?.trainingStressScore != null
            ? Math.round(s.trainingStressScore) : null,
        intensityFactor: s?.intensityFactor != null
            ? s.intensityFactor.toFixed(2) : null,
        totalWork: s?.totalWork != null
            ? Math.round(s.totalWork / 1000) : null
    };
}
