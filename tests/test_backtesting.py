import unittest

from data_manager import SubwayList
from prediction_backtest import run_backtest
from tests.test_congestion_predictor import record


class TestBacktesting(unittest.TestCase):
    def test_backtest_does_not_use_target_year_in_training(self):
        data = SubwayList([record(2024, 10), record(2025, 20), record(2026, 30)])
        result = run_backtest(data, 2026, 1)
        self.assertEqual(result["compared_profiles"], 1)
        self.assertEqual(result["compared_time_slots"], 39)
        self.assertAlmostEqual(result["mae"], 13.33, places=2)
        self.assertEqual(result["last_available_year_baseline_mae"], 10.0)

    def test_unavailable_actual_values_not_treated_as_zero(self):
        real = [None] + [30] * 38
        data = SubwayList([record(2024, 10), record(2025, 20), record(2026, real)])
        result = run_backtest(data, 2026, 1)
        self.assertEqual(result["compared_time_slots"], 38)


if __name__ == "__main__":
    unittest.main()
