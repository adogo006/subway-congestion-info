(function (globalScope) {
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

    const exported = { UIManager };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.uiManager = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
