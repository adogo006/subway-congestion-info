(function (globalScope) {
    const isCommonJS = typeof module !== "undefined" && module.exports && typeof require === "function";
    const {
        OPERATING_TIME_SLOTS,
        getEquivalentDirections,
        formatTimeLabel,
        timeSlotToKey,
        getRecordQuarter,
        selectPreferredPredictionRecord,
        formatDirectionLabel,
    } = isCommonJS
        ? require("./constants.js")
        : globalScope.SubwayDashboardModules.constants;
    const { DEFAULT_CONGESTION_CLASSIFIER } = isCommonJS
        ? require("./congestion_classifier.js")
        : globalScope.SubwayDashboardModules.classifier;

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

    const exported = { ModalManager };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.modalManager = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
