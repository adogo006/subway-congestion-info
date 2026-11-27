(function (globalScope) {
    const OPERATING_TIME_SLOTS = [
        "0530", "0600", "0630", "0700", "0730", "0800", "0830", "0900", "0930",
        "1000", "1030", "1100", "1130", "1200", "1230", "1300", "1330", "1400",
        "1430", "1500", "1530", "1600", "1630", "1700", "1730", "1800", "1830",
        "1900", "1930", "2000", "2030", "2100", "2130", "2200", "2230", "2300",
        "2330", "0000", "0030",
    ];

    const DIRECTION_ALIASES = Object.freeze({
        상선: ["상선", "내선"],
        하선: ["하선", "외선"],
    });

    const LINE_ROUTE_RULES = Object.freeze({
        13: {
            routes: ["2호선"],
            resolveRoute: () => "2호선",
        },
        14: {
            routes: ["2호선", "5호선"],
            resolveRoute: (stationCode) => (normalizeStationCode(stationCode) === "260" ? "5호선" : "2호선"),
        },
        15: {
            routes: ["5호선"],
            resolveRoute: () => "5호선",
        },
        4: {
            routes: ["4호선", "진접선"],
            resolveRoute: (stationCode) => (
                ["405", "406", "408"].includes(normalizeStationCode(stationCode)) ? "진접선" : "4호선"
            ),
        },
    });

    function normalizeStationCode(code) {
        const normalized = String(code ?? "")
            .replaceAll(",", "")
            .replace(/^0+/, "");
        return normalized || "0";
    }

    function getEquivalentDirections(direction) {
        return DIRECTION_ALIASES[direction] || [direction];
    }

    function resolveLineRoutes(line) {
        const lineKey = String(line);
        if (LINE_ROUTE_RULES[lineKey]) {
            return [...LINE_ROUTE_RULES[lineKey].routes];
        }
        if (typeof line === "number" || /^\d+$/.test(lineKey)) {
            return [`${lineKey}호선`];
        }
        return [lineKey];
    }

    function resolveStationRoute(line, stationCode) {
        const lineKey = String(line);
        if (LINE_ROUTE_RULES[lineKey]) {
            return LINE_ROUTE_RULES[lineKey].resolveRoute(stationCode);
        }
        return `${lineKey}호선`;
    }

    function parseCongestionValue(value) {
        if (value === null || value === undefined || value === "") {
            return null;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }

    function formatTimeLabel(time) {
        const normalized = String(time ?? "").replace(":", "").padStart(4, "0");
        return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
    }

    function timeSlotToKey(time) {
        const normalizedTime = String(time ?? "").replace(":", "").padStart(4, "0");
        const match = normalizedTime.match(/^([01]\d|2[0-3])(00|30)$/);
        if (!match) {
            throw new Error(`시간은 00분 또는 30분 단위의 HHMM 형식이어야 합니다: ${time}`);
        }
        const [, hour, minute] = match;
        return minute === "30" ? `hh${hour}_mm30_aft` : `hh${hour}_aft`;
    }

    function getRecordQuarter(record) {
        if (!record || typeof record !== "object") {
            return null;
        }
        const quarter = record.qr ?? record.qu;
        return quarter === undefined || quarter === null || quarter === "" ? null : quarter;
    }

    function getCurrentYearQuarter(referenceDate = new Date()) {
        const date = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
            ? referenceDate
            : new Date();
        return {
            year: date.getFullYear(),
            quarter: Math.floor(date.getMonth() / 3) + 1,
        };
    }

    function isNewerPeriod(candidate, previous) {
        const candidateYear = Number(candidate?.yr) || 0;
        const previousYear = Number(previous?.yr) || 0;
        const candidateQuarter = Number(getRecordQuarter(candidate)) || 0;
        const previousQuarter = Number(getRecordQuarter(previous)) || 0;
        return candidateYear > previousYear
            || (candidateYear === previousYear && candidateQuarter >= previousQuarter);
    }

    function selectPreferredPredictionRecord(records, { year, quarter, referenceDate } = {}) {
        if (!Array.isArray(records) || records.length === 0) {
            return null;
        }

        const hasYearFilter = year !== undefined && year !== null && year !== "";
        const hasQuarterFilter = quarter !== undefined && quarter !== null && quarter !== "";

        const candidates = records.filter((item) => {
            if (!item || typeof item !== "object") {
                return false;
            }
            if (hasYearFilter && String(item.yr) !== String(year)) {
                return false;
            }
            if (hasQuarterFilter && String(getRecordQuarter(item)) !== String(quarter)) {
                return false;
            }
            return true;
        });

        if (candidates.length === 0) {
            return null;
        }

        const current = getCurrentYearQuarter(referenceDate);
        const currentMatch = candidates.find(
            (item) => Number(item.yr) === current.year
                && Number(getRecordQuarter(item)) === current.quarter,
        );
        if (currentMatch) {
            return currentMatch;
        }

        return candidates.reduce(
            (latest, item) => (!latest || isNewerPeriod(item, latest) ? item : latest),
            null,
        );
    }

    function formatDirectionLabel(line, direction, recordDirection) {
        if (recordDirection) {
            return recordDirection;
        }
        if (String(line) === "2") {
            if (direction === "상선") return "내선";
            if (direction === "하선") return "외선";
        }
        return direction || "";
    }

    const exported = {
        OPERATING_TIME_SLOTS,
        DIRECTION_ALIASES,
        LINE_ROUTE_RULES,
        normalizeStationCode,
        getEquivalentDirections,
        resolveLineRoutes,
        resolveStationRoute,
        parseCongestionValue,
        formatTimeLabel,
        timeSlotToKey,
        getRecordQuarter,
        getCurrentYearQuarter,
        isNewerPeriod,
        selectPreferredPredictionRecord,
        formatDirectionLabel,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.constants = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
