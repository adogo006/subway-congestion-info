(function (globalScope) {
    const isCommonJS = typeof module !== "undefined" && module.exports && typeof require === "function";

    const constants = isCommonJS
        ? require("./constants.js")
        : globalScope.SubwayDashboardModules.constants;
    const classifier = isCommonJS
        ? require("./congestion_classifier.js")
        : globalScope.SubwayDashboardModules.classifier;
    const dataModels = isCommonJS
        ? require("./data_models.js")
        : globalScope.SubwayDashboardModules.dataModels;
    const dataManager = isCommonJS
        ? require("./data_manager.js")
        : globalScope.SubwayDashboardModules.dataManager;
    const mapRenderer = isCommonJS
        ? require("./map_renderer.js")
        : globalScope.SubwayDashboardModules.mapRenderer;
    const modalManager = isCommonJS
        ? require("./modal_manager.js")
        : globalScope.SubwayDashboardModules.modalManager;
    const uiManager = isCommonJS
        ? require("./ui_manager.js")
        : globalScope.SubwayDashboardModules.uiManager;

    const SubwayDashboard = {
        CongestionGradeClassifier: classifier.CongestionGradeClassifier,
        Data: dataModels.Data,
        SubwayRecordData: dataModels.SubwayRecordData,
        CongestionData: dataModels.CongestionData,
        PredictionData: dataModels.PredictionData,
        StationData: dataModels.StationData,
        DataManager: dataManager.DataManager,
        MapRenderer: mapRenderer.MapRenderer,
        ModalManager: modalManager.ModalManager,
        UIManager: uiManager.UIManager,
        OPERATING_TIME_SLOTS: constants.OPERATING_TIME_SLOTS,
        DIRECTION_ALIASES: constants.DIRECTION_ALIASES,
        LINE_ROUTE_RULES: constants.LINE_ROUTE_RULES,
        normalizeStationCode: constants.normalizeStationCode,
        resolveLineRoutes: constants.resolveLineRoutes,
        resolveStationRoute: constants.resolveStationRoute,
        getCongestionMeta: classifier.getCongestionMeta,
        formatTimeLabel: constants.formatTimeLabel,
        getCurrentYearQuarter: constants.getCurrentYearQuarter,
        selectPreferredPredictionRecord: constants.selectPreferredPredictionRecord,
    };

    // Expose the classes for the HTML page and for browser-console experimentation.
    if (typeof window !== "undefined") {
        window.SubwayDashboard = SubwayDashboard;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = SubwayDashboard;
    }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : undefined));
