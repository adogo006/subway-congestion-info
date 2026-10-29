import math

from data_manager.data_manager import SubwayData, SubwayList, ByQuarter
from prediction_calculator import PredictionCalculator, save_prediction_json


class CongestionPredictor:
    def __init__(self, calculator=None):
        # keep the calculation separate from the prediction workflow
        self.calculator = calculator if calculator is not None else PredictionCalculator()

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

    def select_congestion_profile(self, data, target_year, target_quarter):
        # use the same quarter from previous years
        same_quarter = data.filter(ByQuarter(target_quarter))
        prior_years = [item for item in same_quarter.items if item.year < target_year]

        if not prior_years:
            raise ValueError("No historical data for the selected quarter")
        if len({item.year for item in prior_years}) < 2:
            raise ValueError("Prediction needs at least two historical years for this quarter")

        return SubwayList(prior_years)

    def build_prediction_data(self, historical_data, target_year, target_quarter):
        return self.calculator.build_prediction_data(historical_data, target_year, target_quarter)

    def predict_congestion_data(self, data, target_year, target_quarter):
        self.validate_input(data, target_year, target_quarter)
        history = self.select_congestion_profile(data, target_year, target_quarter)
        return self.build_prediction_data(history, target_year, target_quarter)

    def save_prediction_json(self, prediction_data, path):
        return save_prediction_json(prediction_data, path)

