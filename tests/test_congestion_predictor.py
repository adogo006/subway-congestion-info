import unittest

from congestion_predictor import CongestionPredictor
from data_manager import SubwayData, SubwayList


def record(year, value, station=101, quarter=1, station_name="Test Station", direction="up", day_type="weekday"):
    values = [value] * 39 if not isinstance(value, list) else value
    return SubwayData(2, station, station_name, day_type, direction, values, year, quarter)


class TestPredictor(unittest.TestCase):
    def test_uses_same_quarter_and_past_only(self):
        data = SubwayList([record(2024, 10), record(2025, 20), record(2026, 900), record(2025, 500, quarter=2)])
        result = CongestionPredictor().predict_congestion_data(data, 2026, 1)
        self.assertEqual(len(result.items), 1)
        self.assertEqual(result.items[0].slot_congestion[0], 16.67)
        self.assertEqual((result.items[0].year, result.items[0].quarter), (2026, 1))

    def test_single_year_profile_is_excluded(self):
        data = SubwayList([record(2024, 10), record(2025, 20), record(2025, 50, station=202)])
        predictor = CongestionPredictor()
        result = predictor.predict_congestion_data(data, 2026, 1)
        self.assertEqual(len(result.items), 1)
        self.assertEqual(predictor.get_quality_report()["insufficient_history_profiles"], 1)

    def test_error_when_no_eligible_profile(self):
        with self.assertRaisesRegex(ValueError, "No reliable historical profiles"):
            CongestionPredictor().predict_congestion_data(SubwayList([record(2025, 10)]), 2026, 1)

    def test_rejects_invalid_input_and_quarter(self):
        p = CongestionPredictor()
        with self.assertRaises(TypeError):
            p.predict_congestion_data([], 2026, 1)
        with self.assertRaises(ValueError):
            p.predict_congestion_data(SubwayList([record(2024, 10)]), 2026, 5)
        with self.assertRaises(ValueError):
            p.predict_congestion_data(SubwayList([]), 2026, 1)
        with self.assertRaises(ValueError):
            p.predict_congestion_data(SubwayList([record(2024, -2), record(2025, 10)]), 2026, 1)

    def test_missing_slot_is_kept_as_none(self):
        a = [None] + [10] * 38
        b = [None] + [20] * 38
        result = CongestionPredictor().predict_congestion_data(
            SubwayList([record(2024, a), record(2025, b)]), 2026, 1)
        self.assertIsNone(result.items[0].slot_congestion[0])
        self.assertEqual(result.items[0].slot_congestion[1], 16.67)

    def test_open_closed_calculator_substitution(self):
        class FakeCalculator:
            def __init__(self):
                self.called_with = None

            def build_prediction_data(self, history, year, quarter):
                self.called_with = (history, year, quarter)
                return SubwayList([])

        fake = FakeCalculator()
        result = CongestionPredictor(fake).predict_congestion_data(
            SubwayList([record(2024, 10), record(2025, 20)]), 2026, 1)
        self.assertIsInstance(result, SubwayList)
        self.assertEqual((fake.called_with[1], fake.called_with[2]), (2026, 1))
        self.assertEqual(len(fake.called_with[0].items), 2)

    def test_quality_report_requires_prediction(self):
        with self.assertRaises(RuntimeError):
            CongestionPredictor().get_quality_report()


if __name__ == "__main__":
    unittest.main()
