(function (globalScope) {
    const isCommonJS = typeof module !== "undefined" && module.exports && typeof require === "function";
    const {
        normalizeStationCode,
        getEquivalentDirections,
        resolveLineRoutes,
        timeSlotToKey,
        getRecordQuarter,
        isNewerPeriod,
        selectPreferredPredictionRecord,
    } = isCommonJS
        ? require("./constants.js")
        : globalScope.SubwayDashboardModules.constants;

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

        filter_by_station_name(items, station_name) {
            return this.filter_items(items, "bldn_nm", station_name);
        }

        filter_by_station_code(items, station_code) {
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
            const station = this.data;
            const filterMethods = [
                ["line", "filter_by_line"],
                ["station_code", "filter_by_station_code"],
                ["station_name", "filter_by_station_name"],
            ];
            return this.apply_filters(station, filters, filterMethods);
        }
    }

    const exported = {
        Data,
        SubwayRecordData,
        CongestionData,
        PredictionData,
        StationData,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.dataModels = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
