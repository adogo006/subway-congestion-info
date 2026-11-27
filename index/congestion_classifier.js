(function (globalScope) {
    const isCommonJS = typeof module !== "undefined" && module.exports && typeof require === "function";
    const { parseCongestionValue } = isCommonJS
        ? require("./constants.js")
        : globalScope.SubwayDashboardModules.constants;

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

    const exported = {
        CongestionGradeClassifier,
        DEFAULT_CONGESTION_CLASSIFIER,
        getCongestionMeta,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    }
    if (globalScope) {
        globalScope.SubwayDashboardModules = globalScope.SubwayDashboardModules || {};
        globalScope.SubwayDashboardModules.classifier = exported;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
