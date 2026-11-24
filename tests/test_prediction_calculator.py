import unittest

from data_manager import SubwayData, SubwayList
from prediction_calculator import PredictionCalculator


def record(year, values):
    slots = [values] * 39 if not isinstance(values, list) else values
    return SubwayData(2, 101, "Test Station", "weekday", "up", slots, year, 1)


class TestTrendAwarePrediction(unittest.TestCase):
    def test_increasing_trend_adjusts_forecast_upward(self):
        history = SubwayList([record(2023, 10), record(2024, 20), record(2025, 30)])
        baseline = PredictionCalculator(trend_strength=0).build_prediction_data(history, 2026, 1)
        improved = PredictionCalculator().build_prediction_data(history, 2026, 1)
        self.assertGreater(improved.items[0].slot_congestion[0], baseline.items[0].slot_congestion[0])

    def test_decreasing_trend_adjusts_forecast_downward_without_negative_values(self):
        history = SubwayList([record(2023, 30), record(2024, 20), record(2025, 10)])
        improved = PredictionCalculator().build_prediction_data(history, 2026, 1)
        self.assertLess(improved.items[0].slot_congestion[0], 16.67)
        self.assertGreaterEqual(improved.items[0].slot_congestion[0], 0)

    def test_missing_values_are_handled_per_slot(self):
        a = [10] * 39
        b = [20] * 39
        c = [30] * 39
        a[0] = None
        b[0] = None
        history = SubwayList([record(2023, a), record(2024, b), record(2025, c)])
        result = PredictionCalculator().build_prediction_data(history, 2026, 1)
        self.assertIsNotNone(result.items[0].slot_congestion[0])
        self.assertEqual(result.items[0].slot_congestion[1], 28.33)

    def test_all_missing_slot_remains_none(self):
        history = SubwayList([record(2023, [None] * 39), record(2024, [None] * 39), record(2025, [None] * 39)])
        result = PredictionCalculator().build_prediction_data(history, 2026, 1)
        self.assertIsNone(result.items[0].slot_congestion[0])

    def test_trend_parameters_are_validated(self):
        with self.assertRaises(ValueError):
            PredictionCalculator(trend_strength=1.5)


if __name__ == "__main__":
    unittest.main()
