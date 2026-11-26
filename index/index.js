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

class CongestionGradeClassifier {
    static DEFAULT_THRESHOLDS = Object.freeze([
        { max: 20, level: "low", label: "원활", color: "#58d68d" },
        { max: 40, level: "moderate", label: "보통", color: "#f4d03f" },
        { max: 70, level: "high", label: "혼잡", color: "#f1948a" },
        { max: Infinity, level: "very-high", label: "매우 혼잡", color: "#ff3030" },
    ]);

    static MISSING_META = Object.freeze({
        level: "missing",
        label: "데이터 없음",
        color: "#64748b",
        value: null,
    });

    constructor(thresholds = CongestionGradeClassifier.DEFAULT_THRESHOLDS) {
        if (!Array.isArray(thresholds) || thresholds.length === 0) {
            throw new TypeError("thresholds must be a non-empty array");
        }
        this.thresholds = thresholds;
    }

    classify(value) {
        const numeric = parseCongestionValue(value);
        if (numeric === null) {
            return { ...CongestionGradeClassifier.MISSING_META };
        }
        const matched = this.thresholds.find((rule) => numeric < rule.max)
            || this.thresholds[this.thresholds.length - 1];
        return {
            level: matched.level,
            label: matched.label,
            color: matched.color,
            value: numeric,
        };
    }

    getColor(value) {
        return this.classify(value).color;
    }
}

const DEFAULT_CONGESTION_CLASSIFIER = new CongestionGradeClassifier();

function getCongestionMeta(value) {
    return DEFAULT_CONGESTION_CLASSIFIER.classify(value);
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

class Data {
    constructor(path = "", { fetcher = null, allowMissing = false } = {}) {
        this.path = path;
        this.data = {};
        this.fetcher = fetcher;
        this.allowMissing = Boolean(allowMissing);
    }

    async json_to_object(path, options = {}) {
        const allowMissing = options.allowMissing ?? this.allowMissing;
        const fetcher = options.fetcher ?? this.fetcher ?? (typeof fetch === "function" ? fetch : null);
        if (typeof fetcher !== "function") {
            throw new Error(`JSON을 불러올 fetcher가 설정되지 않았습니다: ${path}`);
        }
        const response = await fetcher(path);
        if (allowMissing && response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`JSON 파일을 불러오지 못했습니다: ${path}`);
        }
        return response.json();
    }

    // 객체에 저장된 경로와 json_to_object 메서드로 파싱 수행 및 data 객체로 각각 저장
    async load_json(options = {}) {
        const response = await this.json_to_object(this.path, {
            allowMissing: this.allowMissing,
            ...options,
        });
        this.data = response ?? [];
        return this;
    }

    get_filtered_data(_filters = {}) {
        return this.data;
    }

    filter_items(items, key, value) {

        if (value === undefined || value === null || value === "") {
            return items;
        }

        let source;
        if (Array.isArray(items)) {
            source = items;
        } else if (items && Array.isArray(items.DATA)) {
            source = items.DATA;
        } else if (items && typeof items === "object" && key in items) {
            source = [items];
        } else {
            source = Object.values(items || {});
        }

        return source.filter((item) => {
            if (item === null || typeof item !== "object") {
                return false;
            }
            return typeof value === "function"
                ? value(item)
                : String(item[key]) === String(value);
        });
    }

    apply_filters(items, filters, filterMethods) {
        return filterMethods.reduce((result, [key, methodName]) => {
            const value = filters[key];
            if (value === undefined || value === null || value === "") {
                return result;
            }
            return this[methodName](result, value);
        }, items);
    }
}

class SubwayRecordData extends Data {
    normalize_station_code(code) {
        return normalizeStationCode(code);
    }

    get_matching_records(filters = {}) {
        const filterMethods = [
            ["year", "filter_by_year"],
            ["day_type", "filter_by_day_type"],
            ["line", "filter_by_line"],
            ["direction", "filter_by_direction"],
            ["station_code", "filter_by_station_code"],
            ["station_name", "filter_by_station_name"],
            ["quarter", "filter_by_quarter"],
        ];
        return this.apply_filters(this.data, filters, filterMethods);
    }

    get_filtered_data(filters = {}) {
        const filtered = this.get_matching_records(filters);
        return this.select_latest_by_station(filtered);
    }

    filter_by_year(items, year) {
        return this.filter_items(items, "yr", year);
    }

    filter_by_day_type(items, dayType) {
        return this.filter_items(items, "day", dayType);
    }

    filter_by_line(items, line) {
        return this.filter_items(items, "lnno", line);
    }

    filter_by_direction(items, direction) {
        const directions = getEquivalentDirections(direction);
        return this.filter_items(
            items,
            "drc",
            (item) => directions.includes(item.drc),
        );
    }

    filter_by_station_code(items, stationCode) {
        const normalizedCode = this.normalize_station_code(stationCode);
        return this.filter_items(
            items,
            "sttn_no",
            (item) => this.normalize_station_code(item.sttn_no) === normalizedCode,
        );
    }

    filter_by_station_name(items, stationName) {
        return this.filter_items(items, "sttn_nm", stationName);
    }

    filter_by_quarter(items, quarter) {
        return this.filter_items(
            items,
            "qu",
            (item) => {
                const itemQuarter = getRecordQuarter(item);
                return itemQuarter !== null && String(itemQuarter) === String(quarter);
            },
        );
    }

    select_latest_by_station(items) {
        const latestByStation = new Map();
        for (const item of this.filter_items(items, "sttn_no", () => true)) {
            const stationCode = this.normalize_station_code(item.sttn_no);
            const previous = latestByStation.get(stationCode);
            if (!previous || this.is_newer(item, previous)) {
                latestByStation.set(stationCode, item);
            }
        }
        return [...latestByStation.values()];
    }

    is_newer(candidate, previous) {
        return isNewerPeriod(candidate, previous);
    }

    time_to_key(time) {
        return timeSlotToKey(time);
    }
}

class CongestionData extends SubwayRecordData {

    constructor(path = "", options = {}) {
        super(path || "../data/congestion.json", options);
    }

    find_baseline_record(filters = {}, targetYear, targetQuarter) {
        const numericYear = Number(targetYear);
        const numericQuarter = Number(targetQuarter);
        if (!Number.isFinite(numericYear) || !Number.isFinite(numericQuarter) || numericQuarter < 1 || numericQuarter > 4) {
            return { record: null, matchType: "none" };
        }

        const baseFilters = {
            day_type: filters.day_type,
            direction: filters.direction,
            quarter: numericQuarter,
        };
        const hasLine = filters.line !== undefined && filters.line !== null && filters.line !== "";
        const hasCode = filters.station_code !== undefined
            && filters.station_code !== null
            && filters.station_code !== "";
        const hasName = Boolean(filters.station_name);

        const candidateFilterSets = [];
        if (hasCode) {
            if (hasLine) {
                candidateFilterSets.push({ ...baseFilters, line: filters.line, station_code: filters.station_code });
            }
            candidateFilterSets.push({ ...baseFilters, station_code: filters.station_code });
        }
        if (hasName) {
            candidateFilterSets.push({
                ...baseFilters,
                ...(hasLine ? { line: filters.line } : {}),
                station_name: filters.station_name,
            });
        }
        if (candidateFilterSets.length === 0) {
            candidateFilterSets.push({ ...baseFilters, ...(hasLine ? { line: filters.line } : {}) });
        }

        // 1순위: 전년도 동일 분기 (yr === targetYear - 1, qu === targetQuarter)
        const previousYear = numericYear - 1;
        for (const filterSet of candidateFilterSets) {
            const exactMatches = this.get_matching_records({
                ...filterSet,
                year: previousYear,
            });
            if (exactMatches.length > 0) {
                return { record: exactMatches[0], matchType: "prev_year_same_quarter" };
            }
        }

        // 2순위 (폴백): 동일 분기 중 예측 연도 이전의 가장 최신 실측 (yr < targetYear, qu === targetQuarter)
        for (const filterSet of candidateFilterSets) {
            const sameQuarterMatches = this.get_matching_records(filterSet).filter((item) => {
                const itemYear = Number(item.yr);
                return Number.isFinite(itemYear) && itemYear < numericYear;
            });
            if (sameQuarterMatches.length > 0) {
                const latestSameQuarter = sameQuarterMatches.reduce(
                    (latest, item) => (!latest || this.is_newer(item, latest) ? item : latest),
                    null,
                );
                return { record: latestSameQuarter, matchType: "latest_same_quarter" };
            }
        }

        // 3순위: 동일 분기 실측 없음 (타 분기 또는 연단위 구형 데이터 혼입 금지)
        return { record: null, matchType: "none" };
    }
}

class PredictionData extends SubwayRecordData {

    constructor(path = "", options = {}) {
        super(path || "../data/prediction.json", { allowMissing: true, ...options });
    }

    get_filtered_data(filters = {}) {
        const filtered = this.get_matching_records(filters);
        return this.select_preferred_by_station(filtered, {
            year: filters.year,
            quarter: filters.quarter,
            referenceDate: filters.referenceDate,
        });
    }

    select_preferred_by_station(items, options = {}) {
        const recordsByStation = new Map();
        for (const item of this.filter_items(items, "sttn_no", () => true)) {
            const stationCode = this.normalize_station_code(item.sttn_no);
            if (!recordsByStation.has(stationCode)) {
                recordsByStation.set(stationCode, []);
            }
            recordsByStation.get(stationCode).push(item);
        }

        const selected = [];
        for (const stationRecords of recordsByStation.values()) {
            const preferred = selectPreferredPredictionRecord(stationRecords, options);
            if (preferred) {
                selected.push(preferred);
            }
        }
        return selected;
    }
}

class StationData extends Data {

    constructor(path = "", options = {}) {
        super(path || "../data/station.json", options);
    }

    normalize_station_code(code) {
        return normalizeStationCode(code);
    }

    filter_by_station_name(items, station_name){
        return this.filter_items(items, "bldn_nm", station_name);
    }

    filter_by_station_code(items, station_code){
        const normalizedCode = this.normalize_station_code(station_code);
        return this.filter_items(
            items,
            "bldn_id",
            (item) => this.normalize_station_code(item.bldn_id) === normalizedCode,
        );
    }

    line_to_route(line) {
        if (typeof line === "number" || /^\d+$/.test(String(line))) {
            return `${line}호선`;
        }

        return String(line);
    }

    filter_by_line(items, line) {
        const routes = this.line_to_routes(line);
        return this.filter_items(
            items,
            "route",
            (item) => routes.includes(item.route),
        );
    }

    line_to_routes(line) {
        return resolveLineRoutes(line);
    }

    get_filtered_data(filters = {}) {
        let station = this.data;

        const filterMethods = [
            ["line", "filter_by_line"],
            ["station_code", "filter_by_station_code"],
            ["station_name", "filter_by_station_name"],
        ];
        return this.apply_filters(station, filters, filterMethods);
    }
}



class DataManager {
    // 생성자로 각 데이터 파일의 경로 설정 및 데이터 소스 의존성 주입(DI) 지원
    constructor(paths = {}, dependencies = {}) {
        this.paths = {
            congestion: paths.congestion || "../data/congestion.json",
            prediction: paths.prediction || "../data/prediction.json",
            station: paths.station || "../data/station.json",
            routeOrder: paths.routeOrder || "../data/route_order.json",
        };
        const sourceOptions = dependencies.fetcher ? { fetcher: dependencies.fetcher } : {};

        this.congestion_data = dependencies.congestionData || new CongestionData(this.paths.congestion, sourceOptions);
        this.prediction_data = dependencies.predictionData || new PredictionData(this.paths.prediction, sourceOptions);
        this.station_data = dependencies.stationData || new StationData(this.paths.station, sourceOptions);
        this.route_order_data = dependencies.routeOrderData || new Data(this.paths.routeOrder, sourceOptions);
        this.matched_station_data = [];
    }

    async load_all() {
        await Promise.all([
            this.congestion_data.load_json(),
            this.prediction_data.load_json(),
            this.station_data.load_json(),
            this.route_order_data.load_json(),
        ]);
        this.matched_station_data = this.match_station_data(
            //this.congestion_data.data,  혼잡도 데이터로 표시를 예측데이터로 변경
            this.prediction_data.data,
            this.station_data.data,
        );
        return this;
    }

    normalize_station_code(code) {
        return normalizeStationCode(code);
    }

    normalize_station_name(name) {
        return String(name ?? "")
            .replace(/\([^)]*\)/g, "")
            .replace(/[\s·.-]/g, "")
            .replace(/[ES]$/i, "")
            .toLowerCase();
    }

    congestion_route_to_station_route(line, stationCode) {
        return resolveStationRoute(line, stationCode);
    }

    to_array(items) {
        if (Array.isArray(items)) {
            return items;
        }
        if (items && Array.isArray(items.DATA)) {
            return items.DATA;
        }
        return Object.values(items || {});
    }

    match_station_data(congestionItems, stationItems) {
        const congestion = this.to_array(congestionItems);
        const stations = this.to_array(stationItems);
        const stationById = new Map();
        const stationByName = new Map();

        for (const station of stations) {
            const route = station.route;
            const code = this.normalize_station_code(station.bldn_id);
            const name = `${route}|${this.normalize_station_name(station.bldn_nm)}`;
            stationById.set(`${route}|${code}`, station);
            if (!stationByName.has(name)) {
                stationByName.set(name, []);
            }
            stationByName.get(name).push(station);
        }

        const matchedByStationId = new Map();
        for (const item of congestion) {
            if (item?.lnno === null || item?.sttn_no === null) {
                continue;
            }

            const route = this.congestion_route_to_station_route(item.lnno, item.sttn_no);
            const code = this.normalize_station_code(item.sttn_no);
            const direct = stationById.get(`${route}|${code}`);
            const candidates = direct
                ? [direct]
                : stationByName.get(`${route}|${this.normalize_station_name(item.sttn_nm)}`) || [];
            const station = candidates.length === 1 ? candidates[0] : direct;

            if (!station) {
                continue;
            }

            const stationId = station.bldn_id;
            if (!matchedByStationId.has(stationId)) {
                matchedByStationId.set(stationId, {
                    ...station,
                    station_code: station.bldn_id,
                    station_name: station.bldn_nm,
                    congestion_data: [],
                });
            }
            matchedByStationId.get(stationId).congestion_data.push(item);
        }

        return [...matchedByStationId.values()];
    }
    get_filtered_data(filters = {}) {
        const { time, ...dataFilters } = filters;
        const congestion = this.congestion_data.get_filtered_data(dataFilters);
        const prediction = this.prediction_data.get_filtered_data(dataFilters);
        const station = this.station_data.apply_filters(
            this.matched_station_data,
            dataFilters,
            [
                ["line", "filter_by_line"],
                ["station_code", "filter_by_station_code"],
                ["station_name", "filter_by_station_name"],
            ],
        );

        return {
            congestion,
            prediction,
            station,
        };
    }

    get_operating_times() {
        return [...OPERATING_TIME_SLOTS];
    }

    get_station_detail(stationOrCode, filters = {}) {
        const isStationObject = stationOrCode && typeof stationOrCode === "object";
        const rawCode = isStationObject
            ? (stationOrCode.station_code ?? stationOrCode.bldn_id ?? stationOrCode.sttn_no)
            : stationOrCode;
        const normalizedCode = this.normalize_station_code(rawCode);

        const matchedStation = this.matched_station_data.find(
            (item) => this.normalize_station_code(item.station_code) === normalizedCode,
        );
        const station = isStationObject
            ? { ...(matchedStation || {}), ...stationOrCode }
            : (matchedStation || { station_code: String(rawCode ?? "") });

        const recordFilters = {
            day_type: filters.day_type,
            direction: filters.direction,
            year: filters.year,
        };

        let quarterlyPredictions = [];
        if (Array.isArray(station.congestion_data) && station.congestion_data.length > 0) {
            quarterlyPredictions = this.prediction_data.apply_filters(
                station.congestion_data,
                recordFilters,
                [
                    ["day_type", "filter_by_day_type"],
                    ["direction", "filter_by_direction"],
                    ["year", "filter_by_year"],
                ],
            );
        }

        if (quarterlyPredictions.length === 0 && rawCode !== undefined && rawCode !== null && rawCode !== "") {
            quarterlyPredictions = this.prediction_data.get_matching_records({
                ...recordFilters,
                line: filters.line,
                station_code: rawCode,
            });
        }

        quarterlyPredictions = [...quarterlyPredictions].sort((a, b) => {
            const yearDiff = (Number(a.yr) || 0) - (Number(b.yr) || 0);
            if (yearDiff !== 0) {
                return yearDiff;
            }
            return (Number(getRecordQuarter(a)) || 0) - (Number(getRecordQuarter(b)) || 0);
        });

        const prediction = selectPreferredPredictionRecord(quarterlyPredictions, {
            year: filters.year,
            quarter: filters.quarter,
            referenceDate: filters.referenceDate,
        });

        const actualFilters = {
            day_type: filters.day_type,
            direction: filters.direction,
        };
        const predYear = prediction ? Number(prediction.yr) : NaN;
        const predQuarter = prediction ? Number(getRecordQuarter(prediction)) : NaN;

        let actual = null;
        let actualMatchType = "none";

        if (Number.isFinite(predYear) && Number.isFinite(predQuarter) && predQuarter >= 1 && predQuarter <= 4) {
            const baseline = this.congestion_data.find_baseline_record(
                {
                    ...actualFilters,
                    line: filters.line,
                    station_code: rawCode,
                    station_name: station.station_name,
                },
                predYear,
                predQuarter,
            );
            actual = baseline.record;
            actualMatchType = baseline.matchType;
        } else {
            if (rawCode !== undefined && rawCode !== null && rawCode !== "") {
                actual = this.congestion_data.get_filtered_data({
                    ...actualFilters,
                    line: filters.line,
                    station_code: rawCode,
                })[0] || this.congestion_data.get_filtered_data({
                    ...actualFilters,
                    station_code: rawCode,
                })[0] || null;
            }
            if (!actual && station.station_name) {
                actual = this.congestion_data.get_filtered_data({
                    ...actualFilters,
                    line: filters.line,
                    station_name: station.station_name,
                })[0] || null;
            }
            actualMatchType = actual ? "latest_any" : "none";
        }

        return {
            ...station,
            station_code: station.station_code ?? String(rawCode ?? ""),
            station_name: station.station_name || prediction?.sttn_nm || actual?.sttn_nm || "역 상세 정보",
            prediction,
            quarterly_predictions: quarterlyPredictions,
            actual,
            actual_match_type: actualMatchType,
        };
    }

    order_station_paths(stations, line) {
        const order = this.route_order_data.data?.[String(line)];
        const stationById = new Map(
            this.to_array(stations).map((station) => [
                this.normalize_station_code(station.station_code),
                station,
            ]),
        );
        if (!order) {
            return [this.to_array(stations)];
        }

        const orderedPaths = [];
        const added = new Set();
        Object.values(order).forEach((stationCodes) => {
            const path = [];
            stationCodes.forEach((stationCode) => {
                const normalizedCode = this.normalize_station_code(stationCode);
                const station = stationById.get(normalizedCode);
                if (station && !path.includes(station)) {
                    path.push(station);
                    added.add(normalizedCode);
                }
            });
            if (path.length > 0) {
                orderedPaths.push(path);
            }
        });
        stationById.forEach((station, stationCode) => {
            if (!added.has(stationCode)) {
                orderedPaths.push([station]);
            }
        });
        return orderedPaths;
    }
}

class MapRenderer {
    constructor({ container, dataManager, onStationClick, onBackgroundClick, classifier } = {}) {
        this.container = this.findElement(container);
        this.dataManager = dataManager;
        this.onStationClick = onStationClick;
        this.onBackgroundClick = onBackgroundClick;
        this.classifier = classifier || DEFAULT_CONGESTION_CLASSIFIER;
        this.showHeatMap = true;
        this.selectedStationCode = "";
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.mapBounds = {
            top: 37.715133,
            bottom: 37.413294,
            left: 126.734086,
            right: 127.269311,
        };
    }

    // 지도를 넣을 container 요소를 찾는데 사용되는 메서드
    findElement(element) {
        if (!element) {
            return null;
        }
        // 문자열로 받으면 직접 요소를 찾고 아닐시 요소를 그대로 사용
        return typeof element === "string" ? document.querySelector(element) : element;
    }

    hasRenderedMap() {
        return Boolean(this.container?.querySelector?.("svg"));
    }

    render_map(items = this.dataManager?.matched_station_data, line) {
        if (!this.container) {
            return;
        }

        this.container.replaceChildren(); // 이전 내용을 비우는 역할

        //데이터를 역단위로 배열 로 변환
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        svg.setAttribute("viewBox", "0 0 970 690");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "지하철 노선 지도");
        svg.setAttribute("tabindex", "0");

        const mapViewport = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g",
        );
        const background = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "image",
        );
        background.setAttribute("x", "0");
        background.setAttribute("y", "0");
        background.setAttribute("width", "970");
        background.setAttribute("height", "690");
        background.setAttribute("preserveAspectRatio", "none");
        background.setAttribute("href", "../data/Seoul_South_Korea_location_map.svg");
        background.setAttribute("class", "map-background");
        background.setAttribute("aria-hidden", "true");
        background.setAttribute("pointer-events", "none");

        const mapGroup = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g",
        );

        const stationPaths = line === undefined
            ? [this.toArray(items)]
            : this.dataManager.order_station_paths(items, line);
        const positionsByStation = new Map();
        const getPosition = (station) => {
            const stationCode = this.dataManager.normalize_station_code(
                station.station_code,
            );
            if (positionsByStation.has(stationCode)) {
                return positionsByStation.get(stationCode);
            }

            const latitude = Number(station.lat);
            const longitude = Number(station.lot);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
            }

            const position = {
                station,
                x: ((longitude - this.mapBounds.left)
                    / (this.mapBounds.right - this.mapBounds.left)) * 970,
                y: ((this.mapBounds.top - latitude)
                    / (this.mapBounds.top - this.mapBounds.bottom)) * 690,
            };
            positionsByStation.set(stationCode, position);
            return position;
        };

        stationPaths.forEach((path) => {
            const positions = path.map(getPosition).filter(Boolean);
            if (positions.length < 2) {
                return;
            }

            const routeLine = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "polyline",
            );
            routeLine.setAttribute(
                "points",
                positions.map(({ x, y }) => `${x},${y}`).join(" "),
            );
            routeLine.setAttribute("fill", "none");
            routeLine.setAttribute("stroke", "#334155");
            routeLine.setAttribute("stroke-width", "6");
            routeLine.dataset.baseStrokeWidth = "6";
            routeLine.setAttribute("stroke-linecap", "round");
            routeLine.setAttribute("stroke-linejoin", "round");
            mapGroup.append(routeLine);
        });

        const positions = [...positionsByStation.values()];

        positions.forEach(({ station, x, y }) => {
                const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                point.setAttribute("cx", x);
                point.setAttribute("cy", y);
                point.setAttribute("r", "9");
                point.dataset.baseRadius = "9";
                point.setAttribute("fill", "#64748b");
                point.setAttribute("data-station-code", station.station_code ?? "");
                point.setAttribute("tabindex", "0");
                point.setAttribute("role", "button");
                point.setAttribute("aria-label", station.station_name || "역");
                point.addEventListener("click", (event) => {
                    event.stopPropagation?.();
                    if (this.suppressStationClick) {
                        event.preventDefault?.();
                        return;
                    }
                    this.onStationClick?.(station);
                });
                point.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault?.();
                        this.onStationClick?.(station);
                    }
                });
                mapGroup.append(point);
                const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                label.setAttribute("x", x);
                label.setAttribute("y", y + 24);
                label.dataset.baseY = String(y);
                label.dataset.baseFontSize = "11";
                label.setAttribute("text-anchor", "middle");
                label.setAttribute("class", "station-label");
                label.textContent = station.station_name || "이름 없음";
                mapGroup.append(label);
        });

        mapViewport.append(background, mapGroup);
        svg.append(mapViewport);
        this.container.append(svg);
        this.attachMapInteractions(svg);
        this.updateMapTransform(mapViewport);
        this.updateStationAppearance(mapViewport);
        this.setSelectedStation(this.selectedStationCode);
        return svg;
    }

    attachMapInteractions(svg) {
        let dragging = false;
        let moved = false;
        let pointerCaptured = false;
        let startX = 0;
        let startY = 0;
        let initialPanX = 0;
        let initialPanY = 0;

        svg.addEventListener("wheel", (event) => {
            event.preventDefault();
            const direction = event.deltaY < 0 ? 1 : -1;
            const previousZoom = this.zoom;
            const nextZoom = Math.max(1, Math.min(5, previousZoom + direction * 0.25));
            if (nextZoom === previousZoom) {
                return;
            }

            const pointer = this.getSvgPoint(svg, event.clientX, event.clientY);
            this.panX = pointer.x - (pointer.x - this.panX) * (nextZoom / previousZoom);
            this.panY = pointer.y - (pointer.y - this.panY) * (nextZoom / previousZoom);
            this.zoom = nextZoom;
            const viewport = svg.querySelector("g");
            this.updateMapTransform(viewport);
            this.updateStationAppearance(viewport);
        }, { passive: false });

        svg.addEventListener("pointerdown", (event) => {
            dragging = true;
            moved = false;
            pointerCaptured = false;
            startX = event.clientX;
            startY = event.clientY;
            initialPanX = this.panX;
            initialPanY = this.panY;
        });

        svg.addEventListener("pointermove", (event) => {
            if (!dragging) {
                return;
            }
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            if (!moved && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
                moved = true;
                if (!pointerCaptured) {
                    svg.setPointerCapture?.(event.pointerId);
                    pointerCaptured = true;
                }
                svg.classList.add("is-dragging");
            }
            if (!moved) {
                return;
            }
            const start = this.getSvgPoint(svg, startX, startY);
            const current = this.getSvgPoint(
                svg, event.clientX, event.clientY
            );
            
            this.panX = initialPanX + (current.x - start.x);
            this.panY = initialPanY + (current.y - start.y);
            this.updateMapTransform(svg.querySelector("g"));
        });

        const stopDragging = (event) => {
            if (!dragging) {
                return;
            }
            dragging = false;
            if (pointerCaptured) {
                svg.releasePointerCapture?.(event.pointerId);
                pointerCaptured = false;
            }
            svg.classList.remove("is-dragging");
            if (moved) {
                this.suppressStationClick = true;
                setTimeout(() => {
                    this.suppressStationClick = false;
                }, 0);
            }
        };
        svg.addEventListener("pointerup", stopDragging);
        svg.addEventListener("pointercancel", stopDragging);

        svg.addEventListener("click", (event) => {
            if (this.suppressStationClick) {
                return;
            }
            const target = event?.target;
            const clickedStation = Boolean(
                target?.closest?.("circle[data-station-code]")
                || target?.dataset?.stationCode
                || target?.getAttribute?.("data-station-code"),
            );
            if (clickedStation) {
                return;
            }
            this.onBackgroundClick?.(event);
        });
    }

    setSelectedStation(stationCode = "") {
        this.selectedStationCode = stationCode ? String(stationCode) : "";
        const normalizedTarget = this.selectedStationCode
            ? this.dataManager?.normalize_station_code(this.selectedStationCode)
            : "";
        const points = this.container?.querySelectorAll?.("circle") || [];
        points.forEach((point) => {
            const code = point.dataset?.stationCode
                ?? point.getAttribute?.("data-station-code")
                ?? "";
            const isSelected = Boolean(
                normalizedTarget
                && this.dataManager?.normalize_station_code(code) === normalizedTarget,
            );
            point.classList?.toggle("is-selected", isSelected);
        });
    }

    getSvgPoint(svg, clientX, clientY) {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse());
    }

    updateStationAppearance(viewport) {
        if (!viewport) {
            return;
        }
        const lineWidth = Math.max(1.25, 6 / this.zoom);
        viewport.querySelectorAll("polyline").forEach((routeLine) => {
            routeLine.setAttribute("stroke-width", String(lineWidth));
        });

        const radius = Math.max(3, 9 / this.zoom);
        const labelFontSize = Math.max(3.5, 11 / this.zoom);
        const labelOffset = radius + labelFontSize * 0.8 + 0.5;
        viewport.querySelectorAll("circle").forEach((point) => {
            point.setAttribute("r", String(radius));
        });
        viewport.querySelectorAll(".station-label").forEach((label) => {
            const pointY = Number(label.dataset.baseY);
            label.setAttribute("y", String(pointY + labelOffset));
            label.style.fontSize = `${labelFontSize}px`;
            label.style.strokeWidth = `${Math.max(0.5, labelFontSize * 0.25)}px`;
        });
    }

    setTimeOfDay(time) {
        const background = this.container?.querySelector(".map-background");
        if (!background) {
            return;
        }

        const hour = Number.parseInt(String(time).padStart(4, "0").slice(0, 2), 10);
        if (!Number.isFinite(hour)) {
            return;
        }

        background.classList.remove(
            "map-background-dawn",
            "map-background-day",
            "map-background-evening",
            "map-background-night",
        );
        if (hour >= 5 && hour < 9) {
            background.classList.add("map-background-dawn");
        } else if (hour >= 9 && hour < 17) {
            background.classList.add("map-background-day");
        } else if (hour >= 17 && hour < 20) {
            background.classList.add("map-background-evening");
        } else {
            background.classList.add("map-background-night");
        }
    }

    updateMapTransform(group) {
        const mapWidth = 970;
        const mapHeight = 690;
    
        const minX = mapWidth * (1 - this.zoom);
        const minY = mapHeight * (1 - this.zoom);
    
        this.panX = Math.max(minX, Math.min(0, this.panX));
        this.panY = Math.max(minY, Math.min(0, this.panY));
    
        if (group) {
            group.setAttribute(
                "transform",
                `translate(${this.panX} ${this.panY}) scale(${this.zoom})`,
            );
        }
    }

    render_heat_map(items = [], time) {
        if (time === undefined || time === null || time === "") {
            return;
        }

        const timeKey = timeSlotToKey(time);
        const congestionByStation = new Map();

        this.toArray(items).forEach((item) => {
            const stationCode = this.dataManager.normalize_station_code(item.sttn_no);
            congestionByStation.set(stationCode, item);
        });

        const points = this.container?.querySelectorAll("circle") || [];
        points.forEach((point) => {
            const item = congestionByStation.get(
                this.dataManager.normalize_station_code(point.dataset.stationCode),
            );
            point.setAttribute(
                "fill",
                this.showHeatMap && item
                    ? this.getCongestionColor(item[timeKey])
                    : "#cbd5e1",
            );
        });
    }

    update_heat_map(items = [], time) {
        this.showHeatMap = !this.showHeatMap;
        this.render_heat_map(items, time);

        return this.showHeatMap;
    }

    toArray(items) {
        return Array.isArray(items) ? items : Object.values(items || {});
    }

    // 혼잡도 별로 색상을 설정
    getCongestionColor(value) {
        return this.classifier.getColor(value);
    }
}

class ModalManager {
    constructor({
        modal,
        title,
        content,
        closeButton,
        lineBadge,
        levelBadge,
        metaInfo,
        onClose,
        onSelectTime,
        classifier,
    } = {}) {
        this.modal = this.findElement(modal) || this.createModal();
        this.title = this.findElement(title, this.modal)
            || this.modal?.querySelector?.(".modal-station")
            || this.modal?.querySelector?.("h2")
            || null;
        this.content = this.findElement(content, this.modal)
            || this.modal?.querySelector?.(".modal-content")
            || this.modal?.querySelector?.("div")
            || null;
        this.closeButton = this.findElement(closeButton, this.modal)
            || this.modal?.querySelector?.(".modal-close")
            || null;
        this.lineBadge = this.findElement(lineBadge, this.modal)
            || this.modal?.querySelector?.(".modal-line")
            || null;
        this.levelBadge = this.findElement(levelBadge, this.modal)
            || this.modal?.querySelector?.(".modal-level-badge")
            || null;
        this.metaInfo = this.findElement(metaInfo, this.modal)
            || this.modal?.querySelector?.(".modal-info")
            || null;
        this.onClose = onClose || null;
        this.onSelectTime = onSelectTime || null;
        this.classifier = classifier || DEFAULT_CONGESTION_CLASSIFIER;
        this.is_open = false;
        this.station_code = "";
        this.current_station = null;
        this.current_filters = {};
        this._bindEvents();
    }

    findElement(element, parent = typeof document !== "undefined" ? document : null) {
        if (!element || !parent) return null;
        return typeof element === "string" ? parent.querySelector?.(element) : element;
    }

    createModal() {
        if (typeof document === "undefined") {
            return null;
        }
        const modal = document.createElement("section");
        modal.className = "station-modal";
        modal.hidden = true;
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "false");

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "modal-close";
        closeButton.setAttribute("aria-label", "모달 닫기");
        closeButton.textContent = "×";

        const header = document.createElement("div");
        header.className = "modal-header";

        const titleGroup = document.createElement("div");
        titleGroup.className = "modal-title-group";

        const titleRow = document.createElement("div");
        titleRow.className = "modal-title-row";

        const lineBadge = document.createElement("span");
        lineBadge.className = "modal-line";

        const title = document.createElement("h2");
        title.className = "modal-station";

        const levelBadge = document.createElement("span");
        levelBadge.className = "modal-level-badge";
        const levelDot = document.createElement("span");
        levelDot.className = "modal-level-dot";
        const levelText = document.createElement("span");
        levelText.className = "modal-level-text";
        levelBadge.append(levelDot, levelText);

        titleRow.append(lineBadge, title, levelBadge);

        const metaInfo = document.createElement("p");
        metaInfo.className = "modal-info";

        titleGroup.append(titleRow, metaInfo);
        header.append(titleGroup);

        const content = document.createElement("div");
        content.className = "modal-content";

        modal.append(closeButton, header, content);
        document.body?.append(modal);
        return modal;
    }

    _bindEvents() {
        if (this.closeButton) {
            this.closeButton.addEventListener("click", (event) => {
                event?.stopPropagation?.();
                this.close_modal();
            });
        }
        if (typeof document !== "undefined" && document.addEventListener) {
            this._keydownHandler = (event) => {
                if (this.is_open && event.key === "Escape") {
                    this.close_modal();
                }
            };
            document.addEventListener("keydown", this._keydownHandler);
        }
    }

    resolveStationRows(station = {}, filters = {}) {
        const directQuarterly = Array.isArray(station.quarterly_predictions)
            ? station.quarterly_predictions
            : null;
        let quarterlyPredictions = directQuarterly;
        if (!quarterlyPredictions) {
            const rawRows = Array.isArray(station.congestion_data)
                ? station.congestion_data
                : (station.congestion_data ? [station.congestion_data] : []);
            const { quarter, ...baseFilters } = filters;
            quarterlyPredictions = rawRows
                .filter((row) => this.matches_filters(row, baseFilters))
                .sort((a, b) => {
                    const yearDiff = (Number(a.yr) || 0) - (Number(b.yr) || 0);
                    if (yearDiff !== 0) return yearDiff;
                    return (Number(getRecordQuarter(a)) || 0) - (Number(getRecordQuarter(b)) || 0);
                });
        }

        let prediction = station.prediction || null;
        if (!prediction && quarterlyPredictions.length > 0) {
            prediction = selectPreferredPredictionRecord(quarterlyPredictions, {
                year: filters.year,
                quarter: filters.quarter,
                referenceDate: filters.referenceDate,
            });
        }
        if (!prediction && Array.isArray(station.congestion_data) && station.congestion_data.length > 0) {
            prediction = station.congestion_data.find((row) => this.matches_filters(row, filters))
                || null;
        }

        return {
            prediction,
            quarterlyPredictions,
            actual: station.actual || null,
            actual_match_type: station.actual_match_type || null,
        };
    }

    open_modal(station, filters = {}) {
        if (!this.modal) return;
        station = station || {};
        this.is_open = true;
        this.station_code = station.station_code || "";
        this.current_station = station;
        this.current_filters = { ...filters };
        this.modal.hidden = false;

        const selectedTime = String(filters.time || "0600").replace(":", "").padStart(4, "0");
        const timeKey = timeSlotToKey(selectedTime);
        const { prediction, quarterlyPredictions, actual, actual_match_type } = this.resolveStationRows(station, filters);
        const predictedMeta = this.classifier.classify(prediction ? prediction[timeKey] : null);

        if (this.lineBadge) {
            this.lineBadge.textContent = String(filters.line ?? prediction?.lnno ?? "");
        }
        if (this.title) {
            this.title.textContent = station.station_name || prediction?.sttn_nm || "역 상세 정보";
        }
        if (this.levelBadge) {
            const dot = this.levelBadge.querySelector?.(".modal-level-dot");
            const text = this.levelBadge.querySelector?.(".modal-level-text");
            if (dot) {
                dot.style.backgroundColor = predictedMeta.color;
            }
            if (text) {
                text.textContent = predictedMeta.label;
            } else {
                this.levelBadge.textContent = predictedMeta.label;
            }
        }
        if (this.metaInfo) {
            const directionText = formatDirectionLabel(
                filters.line ?? prediction?.lnno,
                filters.direction,
                prediction?.drc,
            );
            const quarter = getRecordQuarter(prediction);
            const periodTag = prediction?.yr
                ? `${prediction.yr}${quarter ? ` Q${quarter}` : ""} 예측`
                : "예측 데이터 없음";
            const parts = [
                directionText,
                filters.day_type || prediction?.day || "",
                formatTimeLabel(selectedTime),
            ].filter(Boolean);
            this.metaInfo.textContent = `${parts.join(" · ")} (${periodTag})`;
        }
        if (this.content) {
            this.content.textContent = "";
            this.render_charts(
                { ...station, prediction, quarterly_predictions: quarterlyPredictions, actual, actual_match_type },
                { ...filters, time: selectedTime },
            );
        }
    }

    close_modal({ notify = true } = {}) {
        const wasOpen = this.is_open;
        if (this.modal) {
            this.modal.hidden = true;
        }
        this.is_open = false;
        this.station_code = "";
        this.current_station = null;
        if (notify && wasOpen) {
            this.onClose?.();
        }
    }

    refresh_modal(station, filters = {}) {
        if (this.is_open) {
            this.open_modal(station, filters);
        }
    }

    render_charts(station, filters = {}) {
        if (!this.content) return;
        const selectedTime = String(filters.time || "0600").replace(":", "").padStart(4, "0");
        const timeKey = timeSlotToKey(selectedTime);
        const { prediction, quarterlyPredictions, actual, actual_match_type } = this.resolveStationRows(station, filters);

        const predictedMeta = this.classifier.classify(prediction ? prediction[timeKey] : null);
        const actualMeta = this.classifier.classify(actual ? actual[timeKey] : null);

        const predQuarter = getRecordQuarter(prediction);
        const actualQuarter = getRecordQuarter(actual);

        let matchType = actual_match_type;
        if (!matchType) {
            if (!actual) {
                matchType = "none";
            } else if (
                prediction?.yr
                && predQuarter !== null
                && actualQuarter !== null
                && String(actualQuarter) === String(predQuarter)
            ) {
                if (Number(actual.yr) === Number(prediction.yr) - 1) {
                    matchType = "prev_year_same_quarter";
                } else if (Number(actual.yr) < Number(prediction.yr)) {
                    matchType = "latest_same_quarter";
                } else {
                    matchType = "latest_any";
                }
            } else {
                matchType = "latest_any";
            }
        }

        const deltaBasisLabel = matchType === "prev_year_same_quarter"
            ? "전년 동분기 대비"
            : matchType === "latest_same_quarter"
                ? "동분기 실측 대비"
                : "실측 대비";
        const actualPrefix = matchType === "prev_year_same_quarter"
            ? "전년 동분기 실측"
            : matchType === "latest_same_quarter"
                ? "동분기 최신 실측"
                : matchType === "none"
                    ? "전년 동분기 실측"
                    : "기존 실측";

        // 1. 현재 시간대 예상 vs 전년도 동분기 실측 비교 영역
        const comparisonSection = document.createElement("div");
        comparisonSection.className = "modal-comparison";

        const summaryRow = document.createElement("div");
        summaryRow.className = "modal-summary-row";

        const predictionValueEl = document.createElement("span");
        predictionValueEl.className = "modal-prediction-value";
        predictionValueEl.textContent = predictedMeta.value !== null
            ? `${predictedMeta.value.toFixed(1)}%`
            : "데이터 없음";

        const deltaEl = document.createElement("span");
        deltaEl.className = "modal-delta";
        if (predictedMeta.value !== null && actualMeta.value !== null) {
            const diff = Number((predictedMeta.value - actualMeta.value).toFixed(1));
            if (diff > 0) {
                deltaEl.classList.add("is-up");
                deltaEl.textContent = `▲ +${diff.toFixed(1)}%p (${deltaBasisLabel})`;
            } else if (diff < 0) {
                deltaEl.classList.add("is-down");
                deltaEl.textContent = `▼ ${diff.toFixed(1)}%p (${deltaBasisLabel})`;
            } else {
                deltaEl.textContent = `변동 없음 (${deltaBasisLabel})`;
            }
        } else {
            deltaEl.textContent = actualMeta.value === null ? "실측 비교 없음" : "";
        }
        summaryRow.append(predictionValueEl, deltaEl);
        comparisonSection.append(summaryRow);

        const scaleMax = Math.max(
            100,
            predictedMeta.value ?? 0,
            actualMeta.value ?? 0,
        );
        const compareList = document.createElement("div");
        compareList.className = "modal-compare-list";

        const predLabel = prediction?.yr
            ? `예상 혼잡도 (${prediction.yr}${predQuarter ? ` Q${predQuarter}` : ""})`
            : "예상 혼잡도";
        const actualLabel = actual?.yr
            ? `${actualPrefix} (${actual.yr}${actualQuarter ? ` Q${actualQuarter}` : ""})`
            : actualPrefix;

        compareList.append(
            this._createCompareBar(predLabel, predictedMeta, scaleMax, "predicted-bar"),
            this._createCompareBar(actualLabel, actualMeta, scaleMax, "existing-bar"),
        );
        comparisonSection.append(compareList);
        this.content.append(comparisonSection);

        // 2. 39슬롯 시간대별 예측 혼잡도 미니 차트 (05:30 ~ 00:30)
        const timelineSection = document.createElement("div");
        timelineSection.className = "modal-timeline";

        const timelineTitle = document.createElement("p");
        timelineTitle.className = "modal-section-title";
        timelineTitle.textContent = "시간대별 예측 혼잡도 (05:30 ~ 00:30)";
        timelineSection.append(timelineTitle);

        const slotEntries = OPERATING_TIME_SLOTS.map((slot) => {
            const key = timeSlotToKey(slot);
            const rawValue = prediction ? prediction[key] : null;
            return {
                slot,
                label: formatTimeLabel(slot),
                meta: this.classifier.classify(rawValue),
            };
        });

        const validEntries = slotEntries.filter((entry) => entry.meta.value !== null);
        const maxSlotValue = validEntries.reduce(
            (acc, entry) => Math.max(acc, entry.meta.value),
            100,
        );

        const chart = document.createElement("div");
        chart.className = "congestion-chart";

        slotEntries.forEach(({ slot, label, meta }) => {
            const bar = document.createElement("button");
            bar.type = "button";
            bar.className = "congestion-bar";
            bar.dataset.time = slot;
            if (slot === selectedTime) {
                bar.classList.add("is-selected");
            }
            if (meta.value === null) {
                bar.classList.add("is-missing");
                bar.style.height = "6px";
                bar.style.backgroundColor = meta.color;
                bar.title = `${label} · 데이터 없음`;
            } else {
                const heightPx = Math.max(4, Math.round((meta.value / maxSlotValue) * 66));
                bar.style.height = `${heightPx}px`;
                bar.style.backgroundColor = meta.color;
                bar.title = `${label} · ${meta.value.toFixed(1)}% (${meta.label})`;
            }
            bar.setAttribute("aria-label", bar.title);
            if (this.onSelectTime) {
                bar.addEventListener("click", (event) => {
                    event?.stopPropagation?.();
                    this.onSelectTime(slot);
                });
            }
            chart.append(bar);
        });
        timelineSection.append(chart);

        const axis = document.createElement("div");
        axis.className = "chart-axis";
        ["05:30", "09:00", "13:00", "18:00", "22:00", "00:30"].forEach((tickText) => {
            const tick = document.createElement("span");
            tick.textContent = tickText;
            axis.append(tick);
        });
        timelineSection.append(axis);

        const extremes = document.createElement("p");
        extremes.className = "modal-extremes";
        if (validEntries.length > 0) {
            const peak = validEntries.reduce((a, b) => (b.meta.value > a.meta.value ? b : a));
            const low = validEntries.reduce((a, b) => (b.meta.value < a.meta.value ? b : a));
            extremes.textContent = `최대 ${peak.label} (${peak.meta.value.toFixed(1)}%) · 최소 ${low.label} (${low.meta.value.toFixed(1)}%)`;
        } else {
            extremes.textContent = "선택한 조건의 시간대별 예측 데이터가 없습니다.";
        }
        timelineSection.append(extremes);
        this.content.append(timelineSection);

        // 3. 분기별 예측 요약 (Q1 ~ Q4)
        if (quarterlyPredictions.length > 0) {
            const quartersSection = document.createElement("div");
            quartersSection.className = "modal-quarters";
            const activeYear = prediction?.yr ?? null;
            const activeQuarter = getRecordQuarter(prediction);
            const distinctYears = new Set(
                quarterlyPredictions
                    .map((row) => row.yr)
                    .filter((yr) => yr !== undefined && yr !== null && yr !== ""),
            );
            const showYearInChip = distinctYears.size > 1;

            quarterlyPredictions.forEach((row) => {
                const quarter = getRecordQuarter(row);
                const qMeta = this.classifier.classify(row[timeKey]);
                const chip = document.createElement("div");
                chip.className = "quarter-chip";
                const matchesYear = activeYear === null || String(row.yr) === String(activeYear);
                const matchesQuarter = activeQuarter !== null && String(quarter) === String(activeQuarter);
                if (matchesYear && matchesQuarter) {
                    chip.classList.add("is-active");
                }
                const qLabel = document.createElement("span");
                if (quarter && showYearInChip && row.yr) {
                    qLabel.textContent = `${String(row.yr).slice(-2)} Q${quarter}`;
                } else {
                    qLabel.textContent = quarter ? `Q${quarter}` : String(row.yr || "-");
                }
                const qVal = document.createElement("strong");
                qVal.textContent = qMeta.value !== null ? `${qMeta.value.toFixed(1)}%` : "-";
                chip.append(qLabel, qVal);
                quartersSection.append(chip);
            });
            this.content.append(quartersSection);
        }
    }

    _createCompareBar(labelText, meta, scaleMax, barClass) {
        const item = document.createElement("div");
        item.className = "chart-item";

        const label = document.createElement("div");
        label.className = "chart-label";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = labelText;
        const valStrong = document.createElement("strong");
        valStrong.textContent = meta.value !== null ? `${meta.value.toFixed(1)}%` : "데이터 없음";
        label.append(nameSpan, valStrong);

        const track = document.createElement("div");
        track.className = "chart-track";
        const fill = document.createElement("div");
        fill.className = `chart-fill ${barClass}`;
        const widthPct = meta.value !== null
            ? Math.max(2, Math.min(100, (meta.value / scaleMax) * 100))
            : 0;
        fill.style.width = `${widthPct.toFixed(1)}%`;
        fill.style.backgroundColor = meta.color;
        track.append(fill);

        item.append(label, track);
        return item;
    }

    matches_filters(row, filters) {
        if (!row) {
            return false;
        }
        const directionMatches = filters.direction === undefined
            || getEquivalentDirections(filters.direction).includes(row.drc);
        const rowQuarter = getRecordQuarter(row);
        return (filters.year === undefined || String(row.yr) === String(filters.year))
            && (filters.day_type === undefined || row.day === filters.day_type)
            && directionMatches
            && (filters.quarter === undefined || String(rowQuarter) === String(filters.quarter));
    }
}

class UIManager {
    constructor({ dataManager, mapRenderer, modalManager } = {}) {
        this.dataManager = dataManager;
        this.mapRenderer = mapRenderer;
        this.modalManager = modalManager;
        this.day_type = "평일"; // 평일, 토요일, 일요일
        this.time = "0600"; // 1500 처럼 총 4개의 숫자로 받을 수 있다.
        this.line = "1"; // 기본 1호선으로 설정
        this.direction = "상선";
        this.quarter = undefined;
        this.station_code = "";
        this.selected_station_code = "";
        this.selected_station = null;
        this.rendered_line = null;

        if (this.modalManager) {
            const existingOnClose = this.modalManager.onClose;
            this.modalManager.onClose = () => {
                this.handle_modal_closed();
                existingOnClose?.();
            };
        }
    }

    get_filters() {
        const filters = {
            day_type: this.day_type,
            time: this.time,
            line: this.line,
            direction: this.direction,
        };
        if (this.quarter !== undefined && this.quarter !== null && this.quarter !== "") {
            filters.quarter = this.quarter;
        }
        return filters;
    }

    handle_modal_closed() {
        this.selected_station_code = "";
        this.selected_station = null;
        this.station_code = "";
        this.mapRenderer?.setSelectedStation?.("");
    }

    close_station_modal() {
        this.handle_modal_closed();
        if (this.modalManager?.is_open) {
            this.modalManager.close_modal({ notify: false });
        }
    }

    get_station_detail(station) {
        const filters = this.get_filters();
        if (this.dataManager?.get_station_detail) {
            return this.dataManager.get_station_detail(station, filters);
        }
        return station;
    }

    refresh({ forceMapRender = false } = {}) {
        const { time, ...dataFilters } = this.get_filters();
        const data = this.dataManager.get_filtered_data(dataFilters);
        const lineKey = String(this.line);
        const shouldRenderMap = forceMapRender
            || this.rendered_line !== lineKey
            || !this.mapRenderer?.hasRenderedMap?.();

        if (shouldRenderMap && this.mapRenderer) {
            this.mapRenderer.render_map(data.station, this.line);
            this.rendered_line = lineKey;
        }
        this.mapRenderer?.render_heat_map(data.prediction, time);
        this.mapRenderer?.setTimeOfDay(time);
        this.mapRenderer?.setSelectedStation?.(this.selected_station_code);
        this.refresh_modal(data);
        return data;
    }

    click_station(station) {
        if (!station) {
            this.close_station_modal();
            return null;
        }
        this.selected_station_code = station.station_code ?? "";
        this.selected_station = station;
        this.station_code = this.selected_station_code;
        this.mapRenderer?.setSelectedStation?.(this.selected_station_code);

        const detail = this.get_station_detail(station);
        this.modalManager?.open_modal(detail, this.get_filters());
        return detail;
    }

    toggle_day_type(value) {
        this.day_type = value;
        return this.refresh();
    }

    toggle_line(value) {
        this.close_station_modal();
        this.line = value;
        return this.refresh({ forceMapRender: true });
    }

    toggle_direction(value) {
        this.direction = value;
        return this.refresh();
    }

    toggle_quarter(value) {
        this.quarter = value;
        return this.refresh();
    }

    wheelpicker_time(value) {
        this.time = value;
        return this.refresh();
    }

    refresh_modal(data) {
        if (!this.modalManager?.is_open) {
            return;
        }
        const targetCode = this.selected_station_code || this.modalManager.station_code;
        const normalizedTarget = this.dataManager?.normalize_station_code
            ? this.dataManager.normalize_station_code(targetCode)
            : String(targetCode);
        const selectedStation = data?.station?.find((item) => {
            const itemCode = this.dataManager?.normalize_station_code
                ? this.dataManager.normalize_station_code(item.station_code)
                : String(item.station_code);
            return itemCode === normalizedTarget;
        }) || this.selected_station;

        if (selectedStation) {
            this.selected_station = selectedStation;
            const detail = this.get_station_detail(selectedStation);
            this.modalManager.refresh_modal(detail, this.get_filters());
        } else {
            this.close_station_modal();
        }
    }
}

const SubwayDashboard = {
    CongestionGradeClassifier,
    Data,
    SubwayRecordData,
    CongestionData,
    PredictionData,
    StationData,
    DataManager,
    MapRenderer,
    ModalManager,
    UIManager,
    OPERATING_TIME_SLOTS,
    DIRECTION_ALIASES,
    LINE_ROUTE_RULES,
    normalizeStationCode,
    resolveLineRoutes,
    resolveStationRoute,
    getCongestionMeta,
    formatTimeLabel,
    getCurrentYearQuarter,
    selectPreferredPredictionRecord,
};

// Expose the classes for the HTML page and for browser-console experimentation.
if (typeof window !== "undefined") {
    window.SubwayDashboard = SubwayDashboard;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = SubwayDashboard;
}

function updateLegendPosition() {
    const map = document.querySelector(".station-map");
    const legend = document.querySelector(".legend");

    if (!map || !legend) return;

    const mapBottom = map.getBoundingClientRect().bottom;
    const screenBottom = window.innerHeight;

    legend.style.top = `${(mapBottom + screenBottom) / 2}px`;
}

window.addEventListener("load", updateLegendPosition);
window.addEventListener("resize", updateLegendPosition);
