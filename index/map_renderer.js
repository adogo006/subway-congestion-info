(function (globalScope) {
    const isCommonJS = typeof module !== "undefined" && module.exports && typeof require === "function";
    const { timeSlotToKey } = isCommonJS
        ? require("./constants.js")
        : globalScope.SubwayDashboardModules.constants;
    const { DEFAULT_CONGESTION_CLASSIFIER } = isCommonJS
        ? require("./congestion_classifier.js")
        : globalScope.SubwayDashboardModules.classifier;

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

            // 데이터를 역단위로 배열로 변환
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
                this.panX = initialPanX + deltaX;
                this.panY = initialPanY + deltaY;
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

    const exported = { MapRenderer };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.mapRenderer = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
