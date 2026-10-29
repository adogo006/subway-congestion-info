/**
 * Subway congestion dashboard
 *
 * This file contains the four main objects used by the dashboard:
 * DataManager, MapRenderer, ModalManager, and UIManager.
 *
 * The renderer intentionally uses plain DOM/SVG APIs, so it can be used
 * before choosing a chart or map library.
 */

class Data {
    constructor(path = "") {
        this.path = path;

        this.data = {};
    }

    async json_to_object(path, { allowMissing = false } = {}) {
        const response = await fetch(path);
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
        const response = await this.json_to_object(this.path, options);
        this.data = response ?? [];
        return this;
    }

    normalize_station_code(code) {
        const normalized = String(code ?? "")
            .replaceAll(",", "")
            .replace(/^0+/, "");
        return normalized || "0";
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


class CongestionData extends Data {

    constructor(path ="") {
        super(path || "../data/congestion.json");
    }

    get_filtered_data(filters = {}) {
        const filterMethods = [
            ["year", "filter_by_year"],
            ["day_type", "filter_by_day_type"],
            ["line", "filter_by_line"],
            ["direction", "filter_by_direction"],
            ["station_code", "filter_by_station_code"],
            ["station_name", "filter_by_station_name"],
            ["quarter", "filter_by_quarter"],
        ];
        const filtered = this.apply_filters(this.data, filters, filterMethods);
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
        return this.filter_items(items, "drc", direction);
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
        return this.filter_items(items, "qu", quarter);
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
        const candidateYear = Number(candidate.yr) || 0;
        const previousYear = Number(previous.yr) || 0;
        const candidateQuarter = Number(candidate.qu) || 0;
        const previousQuarter = Number(previous.qu) || 0;
        return candidateYear > previousYear
            || (candidateYear === previousYear && candidateQuarter >= previousQuarter);
    }

    time_to_key(time) {
        const normalizedTime = String(time).padStart(4, "0");
        const match = normalizedTime.match(/^([01]\d|2[0-3])(00|30)$/);

        if (!match) {
            throw new Error(`시간은 00분 또는 30분 단위의 HHMM 형식이어야 합니다: ${time}`);
        }

        const [, hour, minute] = match;
        return minute === "30" ? `hh${hour}_mm30_aft` : `hh${hour}_aft`;
    }

}

class PredictionData extends Data {

    constructor(path ="") {
        super(path || "../data/prediction.json");
    }

    async load_json() {
        return super.load_json({ allowMissing: true });
    }

    get_filtered_data(filters = {}) {
        const filterMethods = [
            ["day_type", "filter_by_day_type"],
            ["line", "filter_by_line"],
            ["direction", "filter_by_direction"],
            ["station_code", "filter_by_station_code"],
            ["station_name", "filter_by_station_name"],
            ["quarter", "filter_by_quarter"],
        ];
        return this.apply_filters(this.data, filters, filterMethods);
    }

    filter_by_day_type(items, dayType) {
        return this.filter_items(items, "day", dayType);
    }

    filter_by_line(items, line) {
        return this.filter_items(items, "lnno", line);
    }

    filter_by_direction(items, direction) {
        return this.filter_items(items, "drc", direction);
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
        return this.filter_items(items, "qu", quarter);
    }
}

class StationData extends Data {

    constructor(path ="") {
        super(path || "../data/station.json");

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
        const lineNumber = String(line);
        if (lineNumber === "13") {
            return ["2호선"];
        }
        if (lineNumber === "14") {
            return ["2호선", "5호선"];
        }
        if (lineNumber === "15") {
            return ["5호선"];
        }
        if (lineNumber === "4") {
            return ["4호선", "진접선"];
        }
        return [this.line_to_route(line)];
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
    // 생성자로 각 데이터 파일의 경로 설정
    constructor(paths = {}) {
        this.paths = {
            congestion: paths.congestion || "../data/congestion.json",
            prediction: paths.prediction || "../data/prediction.json",
            station: paths.station || "../data/station.json",
        };

        this.congestion_data = new CongestionData(this.paths.congestion);
        this.prediction_data = new PredictionData(this.paths.prediction);
        this.station_data = new StationData(this.paths.station);
        this.matched_station_data = [];
    }

    async load_all() {
        await Promise.all([
            this.congestion_data.load_json(),
            this.prediction_data.load_json(),
            this.station_data.load_json(),
        ]);
        this.matched_station_data = this.match_station_data(
            this.congestion_data.data,
            this.station_data.data,
        );
        return this;
    }

    normalize_station_code(code) {
        const normalized = String(code ?? "").replaceAll(",", "").replace(/^0+/, "");
        return normalized || "0";
    }

    normalize_station_name(name) {
        return String(name ?? "")
            .replace(/\([^)]*\)/g, "")
            .replace(/[\s·.-]/g, "")
            .replace(/[ES]$/i, "")
            .toLowerCase();
    }

    congestion_route_to_station_route(line, stationCode) {
        const lineNumber = String(line);
        const code = this.normalize_station_code(stationCode);

        if (lineNumber === "13") {
            return "2호선";
        }
        if (lineNumber === "14") {
            return code === "260" ? "5호선" : "2호선";
        }
        if (lineNumber === "15") {
            return "5호선";
        }
        if (lineNumber === "4" && ["405", "406", "408"].includes(code)) {
            return "진접선";
        }
        return `${lineNumber}호선`;
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
}

class MapRenderer {
    constructor({ container, dataManager, onStationClick } = {}) {
        this.container = this.findElement(container);
        this.dataManager = dataManager;
        this.onStationClick = onStationClick;
        this.showHeatMap = true;
    }

    // 지도를 넣을 container 요소를 찾는데 사용되는 메서드
    findElement(element) {
        if (!element) {
            return null;
        }
        // 문자열로 받으면 직접 요소를 찾고 아닐시 요소를 그대로 사용
        return typeof element === "string" ? document.querySelector(element) : element;
    }

    render_map(items = this.dataManager?.matched_station_data) {
        if (!this.container) {
            return;
        }

        this.container.replaceChildren(); // 이전 내용을 비우는 역할

        //데이터를 역단위로 배열 로 변환
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        svg.setAttribute("viewBox", "0 0 800 500"); // 내부 좌표공간을 가로 800, 세로 500으로 설정
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "지하철 노선 지도");

        //지하철 선형 직선 생성
        const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");

        //각 점 좌표들을 연결
        line.setAttribute("points", "60,250 220,100 400,250 580,120 740,250");
        line.setAttribute("fill", "none"); // 내부 색상 없음
        line.setAttribute("stroke", "#334155"); // 선 색은 어두운 회색
        line.setAttribute("stroke-width", "8"); // 선 두께는 8
        svg.append(line); // line 객체를 svg 에 추가

        // 역 데이터를 하나씩 반복하면 수행
        const stations = this.toArray(items);
        stations.forEach((station, index) => { 
                const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                const x = 60 + (680 / Math.max(stations.length - 1, 1)) * index; // 가로 간격 일정하게 유지
                const y = 250 + (index % 2 === 0 ? 0 : -50); // 짝수번쨰 역과 홀수번째 역이 위아래로 배치
                point.setAttribute("cx", x);  
                point.setAttribute("cy", y); // 원의 가로, 세로 위치 설정
                point.setAttribute("r", "12"); // 포인트 원의 반지름
                point.setAttribute(
                    "fill",
                    "#64748b",
                );
                point.setAttribute("data-station-code", station.station_code ?? ""); // 혼잡도에 따라 역 색상 설정
                point.setAttribute("tabindex", "0");
                point.setAttribute("role", "button");
                point.addEventListener("click", () => this.onStationClick?.(station)); // 역 클릭시 해당 함수 호출
                point.addEventListener("keydown", (event) => { // 키보드 엔터로도 역 클릭 이벤트 함수 호출
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        this.onStationClick?.(station);
                    }
                });
                svg.append(point);
        });

        this.container.append(svg);
        return svg;
    }

    render_heat_map(items = [], time) {
        if (time === undefined || time === null || time === "") {
            return;
        }

        const timeKey = this.dataManager?.congestion_data?.time_to_key(time);
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
        const congestion = Number(value);
        if (Number.isNaN(congestion)) {
            return "#64748b";
        }
        if (congestion >= 70) return "#dc2626";
        if (congestion >= 40) return "#f97316";
        if (congestion >= 20) return "#eab308";
        return "#22c55e";
    }
}

class ModalManager {
    constructor({ modal, title, content } = {}) {
        this.modal = this.findElement(modal) || this.createModal();
        this.title = this.findElement(title, this.modal);
        this.content = this.findElement(content, this.modal);
        this.is_open = false;
        this.station_code = "";
    }

    findElement(element, parent = document) {
        if (!element) return null;
        return typeof element === "string" ? parent.querySelector(element) : element;
    }

    createModal() {
        const modal = document.createElement("section");
        const title = document.createElement("h2");
        const content = document.createElement("div");
        modal.append(title, content);
        modal.hidden = true;
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        document.body.append(modal);
        return modal;
    }

    open_modal(station, filters = {}) {
        if (!this.modal) return;
        station = station || {};
        this.is_open = true;
        this.station_code = station.station_code || "";
        this.modal.hidden = false;
        if (this.title) {
            this.title.textContent = station.station_name || "역 상세 정보";
        }
        if (this.content) {
            this.content.textContent = "";
            this.render_charts(station, filters);
        }
    }

    close_modal() {
        if (this.modal) {
            this.modal.hidden = true;
        }
        this.is_open = false;
        this.station_code = "";
    }

    refresh_modal(station, filters = {}) {
        if (this.is_open) {
            this.open_modal(station, filters);
        }
    }

    render_charts(station, filters = {}) {
        if (!this.content) return;
        const rows = Array.isArray(station.congestion_data)
            ? station.congestion_data
            : [station.congestion_data];
        const congestionRow = rows.find((row) => (
            this.matches_filters(row, filters)
        )) || rows[0];
        const values = station.congestion_history
            || station.congestion
            || Object.entries(congestionRow || {})
                .filter(([key, value]) => key.startsWith("hh") && value !== null)
                .map(([, value]) => value);
        const chart = document.createElement("div");
        chart.className = "congestion-chart";

        const data = Array.isArray(values) ? values : [values];
        data.forEach((value, index) => {
        const bar = document.createElement("div");
        bar.className = "congestion-bar";
        bar.style.height = `${Math.max(4, Math.min(Number(value) || 0, 200) / 2)}px`;
        bar.title = `${index + 1}: ${value}`;
        chart.append(bar);
        });
        this.content.append(chart);
    }

    matches_filters(row, filters) {
        if (!row) {
            return false;
        }
        return (filters.year === undefined || String(row.yr) === String(filters.year))
            && (filters.day_type === undefined || row.day === filters.day_type)
            && (filters.direction === undefined || row.drc === filters.direction)
            && (filters.quarter === undefined || String(row.qu) === String(filters.quarter));
    }
}

class UIManager {
    constructor({ dataManager, mapRenderer, modalManager } = {}) {
        this.dataManager = dataManager;
        this.mapRenderer = mapRenderer;
        this.modalManager = modalManager;
        this.day_type = "평일"; // 평일 아니면 주말
        this.time = "0000"; // 1500 처럼 총 4개의 숫자로 받을 수 있다.
        this.line = "1"; // 기본 1호선으로 설정
        this.direction = "상선";
        this.station_code = "";
    }

    get_filters() {
        return {
        day_type: this.day_type,
        time: this.time,
        line: this.line,
        direction: this.direction,
        station_code: this.station_code,
        };
    }

    refresh() {
        const { time, ...dataFilters } = this.get_filters();
        const data = this.dataManager.get_filtered_data(dataFilters);
        this.mapRenderer.render_map(data.station);
        this.mapRenderer.render_heat_map(data.congestion, time);
        this.refresh_modal(data);
        return data;
    }

    click_station(station) {
        this.station_code = station.station_code;
        const data = this.refresh();
        const selectedStation = data.station.find(
            (item) => item.station_code === this.station_code,
        ) || station;
        this.modalManager.open_modal(selectedStation, this.get_filters());
        return data;
    }

    toggle_day_type(value) {
        this.day_type = value;
        return this.refresh();
    }

    toggle_line(value) {
        this.line = value;
        return this.refresh();
    }

    toggle_direction(value) {
        this.direction = value;
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
        const selectedStation = data.station.find(
            (item) => item.station_code === this.modalManager.station_code,
        );
        if (selectedStation) {
            this.modalManager.refresh_modal(selectedStation, this.get_filters());
        }
    }
}

// Expose the classes for the HTML page and for browser-console experimentation.
window.SubwayDashboard = {
  DataManager,
  MapRenderer,
  ModalManager,
  UIManager,
};