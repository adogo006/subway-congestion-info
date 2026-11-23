
import copy
import math

from data_manager import SubwayData, SubwayList
from prediction_calculator import PredictionCalculator, save_prediction_json
from prediction_quality import PredictionQualityAnalyzer


class CongestionPredictor:

    def __init__(self, calculator=None, quality_analyzer=None):
        self.calculator = calculator if calculator is not None else PredictionCalculator()
        if not callable(getattr(self.calculator, "build_prediction_data", None)):
            raise TypeError("calculator must implement build_prediction_data")
        self.quality_analyzer = quality_analyzer if quality_analyzer is not None else PredictionQualityAnalyzer()
        self._last_quality_report = None

    def validate_input(self, data, target_year, target_quarter):
        if not isinstance(data, SubwayList):
            raise TypeError("data must be a SubwayList")
        if not isinstance(target_year, int) or isinstance(target_year, bool) or target_year < 2000:
            raise ValueError("target_year must be a valid integer year")
        if not isinstance(target_quarter, int) or isinstance(target_quarter, bool) or target_quarter not in (1, 2, 3, 4):
            raise ValueError("target_quarter must be 1, 2, 3 or 4")
        if len(data) == 0:
            raise ValueError("SubwayList is empty")

        for index, item in enumerate(data.items):
            if not isinstance(item, SubwayData):
                raise TypeError(f"Record {index} is not SubwayData")
            if not isinstance(item.year, int) or isinstance(item.year, bool):
                raise ValueError(f"Record {index}: invalid year")
            if item.quarter is not None and item.quarter not in (1, 2, 3, 4):
                raise ValueError(f"Record {index}: invalid quarter")
            if not isinstance(item.slot_congestion, list) or len(item.slot_congestion) != 39:
                raise ValueError(f"Record {index}: expected 39 congestion time slots")
            for slot, value in enumerate(item.slot_congestion):
                if value is not None and (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(value)
                    or value < 0
                ):
                    raise ValueError(f"Record {index}, slot {slot}: invalid congestion value")

    def _prepare_history(self, data, target_year, target_quarter):
        history, report = self.quality_analyzer.prepare(data, target_year, target_quarter)
        self._last_quality_report = report
        if not history.items:
            raise ValueError("No reliable historical profiles for selected quarter")
        return history

    def select_congestion_profile(self, data, target_year, target_quarter):
        self.validate_input(data, target_year, target_quarter)
        return self._prepare_history(data, target_year, target_quarter)

    def build_prediction_data(self, historical_data, target_year, target_quarter):
        return self.calculator.build_prediction_data(historical_data, target_year, target_quarter)

    def predict_congestion_data(self, data, target_year, target_quarter):
        history = self.select_congestion_profile(data, target_year, target_quarter)
        return self.build_prediction_data(history, target_year, target_quarter)

    def get_quality_report(self):
        if self._last_quality_report is None:
            raise RuntimeError("Run a prediction or select history before requesting the quality report")
        return copy.deepcopy(self._last_quality_report)

    def save_prediction_json(self, prediction_data, path):
        return save_prediction_json(prediction_data, path)
