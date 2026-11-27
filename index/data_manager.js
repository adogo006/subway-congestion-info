(function (globalScope) {
    const isCommonJS = typeof module !== "undefined" && module.exports && typeof require === "function";
    const {
        OPERATING_TIME_SLOTS,
        normalizeStationCode,
        resolveStationRoute,
        getRecordQuarter,
        selectPreferredPredictionRecord,
    } = isCommonJS
        ? require("./constants.js")
        : globalScope.SubwayDashboardModules.constants;
    const {
        Data,
        CongestionData,
        PredictionData,
        StationData,
    } = isCommonJS
        ? require("./data_models.js")
        : globalScope.SubwayDashboardModules.dataModels;

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
                // this.congestion_data.data, 혼잡도 데이터로 표시를 예측데이터로 변경
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

    const exported = { DataManager };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.dataManager = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
