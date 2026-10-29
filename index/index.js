/**
 * Subway congestion dashboard
 *
 * This file contains the four main objects used by the dashboard:
 * DataManager, MapRenderer, ModalManager, and UIManager.
 *
 * The renderer intentionally uses plain DOM/SVG APIs, so it can be used
 * before choosing a chart or map library.
 */

class DataManager {

    // 생성자로 각 데이터 파일의 경로 설정
    constructor(paths = {}) {
        this.paths = {
            congestion: paths.congestion || "../data/congestion.json",
            prediction: paths.prediction || "../data/prediction.json",
            station: paths.station || "../data/station.json",
        };

        this.congestion_data = {};
        this.prediction_data = {};
        this.station_data = {};
    }

    //
    async json_to_object(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`JSON 파일을 불러오지 못했습니다: ${path}`);
        }
        return response.json();
  }

    // 객체에 저장된 경로와 json_to_object 메서드로 파싱 수행 및 data 객체로 각각 저장
    async load_all() {
        const [congestion, prediction, station] = await Promise.all([
            this.json_to_object(this.paths.congestion),
            this.json_to_object(this.paths.prediction),
            this.json_to_object(this.paths.station),
        ]);
        this.congestion_data = congestion;
        this.prediction_data = prediction;
        this.station_data = station;
        return this;
    }

    filter_by_day_type(items, day_type) {
        return this.filter_items(items, "day_type", day_type);
    }

    filter_by_time(items, time) {
        return this.filter_items(items, "time", time);
    }

    filter_by_line(items, line) {
        return this.filter_items(items, "line", line);
    }

    filter_by_direction(items, direction) {
        return this.filter_items(items, "direction", direction);
    }

    filter_by_station_code(items, station_code) {
        return this.filter_items(items, "station_code", station_code);
    }

    filter_items(items, key, value) {

        if (value === undefined || value === null || value === "") {
            return items;
        }

        const source = Array.isArray(items) ? items : Object.values(items);
        return source.filter((item) => {
        if (item === null || typeof item !== "object") {
            return false;
        }
            return String(item[key]) === String(value);
        });
    }

    get_filtered_data(filters = {}) {
        let congestion = this.congestion_data;
        let prediction = this.prediction_data;
        let station = this.station_data;

        const filterMethods = [
        ["day_type", "filter_by_day_type"],
        ["time", "filter_by_time"],
        ["line", "filter_by_line"],
        ["direction", "filter_by_direction"],
        ["station_code", "filter_by_station_code"],
        ];

        for (const [key, methodName] of filterMethods) {
            if (filters[key] === undefined || filters[key] === null || filters[key] === "") {
                continue;
            }

            congestion = this[methodName](congestion, filters[key]);
            prediction = this[methodName](prediction, filters[key]);
            if (key === "line" || key === "station_code") {
                station = this[methodName](station, filters[key]);
            }
        }

        return { congestion, prediction, station };
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
        return typeof element === "string" ? document.querySelector(element) : element;
    }

    render_map(items = this.dataManager?.station_data) {
        if (!this.container) {
            return;
        }

    this.container.replaceChildren();
    const stations = this.toArray(items);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 800 500");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "지하철 노선 지도");

    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", "60,250 220,100 400,250 580,120 740,250");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#334155");
    line.setAttribute("stroke-width", "8");
    svg.append(line);

    stations.forEach((station, index) => {
        const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        const x = 60 + (680 / Math.max(stations.length - 1, 1)) * index;
        const y = 250 + (index % 2 === 0 ? 0 : -50);
        point.setAttribute("cx", x);
        point.setAttribute("cy", y);
        point.setAttribute("r", "12");
        point.setAttribute("fill", this.getCongestionColor(station.congestion));
        point.setAttribute("data-station-code", station.station_code ?? "");
        point.setAttribute("tabindex", "0");
        point.setAttribute("role", "button");
        point.addEventListener("click", () => this.onStationClick?.(station));
        point.addEventListener("keydown", (event) => {
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

  update_heat_map(items = this.dataManager?.prediction_data) {
    this.showHeatMap = !this.showHeatMap;
    const points = this.container?.querySelectorAll("circle") || [];
    const predictions = this.toArray(items);

    points.forEach((point, index) => {
      const prediction = predictions[index];
      point.setAttribute(
        "fill",
        this.showHeatMap ? this.getCongestionColor(prediction?.congestion) : "#cbd5e1",
      );
    });

    return this.showHeatMap;
  }

  toArray(items) {
    return Array.isArray(items) ? items : Object.values(items || {});
  }

  getCongestionColor(value) {
    const congestion = Number(value);
    if (Number.isNaN(congestion)) {
      return "#64748b";
    }
    if (congestion >= 130) return "#dc2626";
    if (congestion >= 100) return "#f97316";
    if (congestion >= 70) return "#eab308";
    return "#22c55e";
  }
}

class ModalManager {
  constructor({ modal, title, content } = {}) {
    this.modal = this.findElement(modal) || this.createModal();
    this.title = this.findElement(title, this.modal);
    this.content = this.findElement(content, this.modal);
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

  open_modal(station) {
    if (!this.modal) return;
    station = station || {};
    this.modal.hidden = false;
    if (this.title) {
      this.title.textContent = station.station_name || "역 상세 정보";
    }
    if (this.content) {
      this.content.textContent = "";
      this.render_charts(station);
    }
  }

  close_modal() {
    if (this.modal) {
      this.modal.hidden = true;
    }
  }

  render_charts(station) {
    if (!this.content) return;
    const values = station.congestion_history || station.congestion || [];
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
}

class UIManager {
  constructor({ dataManager, mapRenderer, modalManager } = {}) {
    this.dataManager = dataManager;
    this.mapRenderer = mapRenderer;
    this.modalManager = modalManager;
    this.day_type = "";
    this.time = "";
    this.line = "";
    this.direction = "";
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
    const data = this.dataManager.get_filtered_data(this.get_filters());
    this.mapRenderer.render_map(data.station);
    return data;
  }

  click_station(station) {
    this.station_code = station.station_code;
    this.modalManager.open_modal(station);
    return this.refresh();
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
}

// Expose the classes for the HTML page and for browser-console experimentation.
window.SubwayDashboard = {
  DataManager,
  MapRenderer,
  ModalManager,
  UIManager,
};