import unittest

from congestion_predictor import CongestionPredictor
from data_manager import SubwayList
from tests.test_congestion_predictor import record


class TestHistoricalQuality(unittest.TestCase):
    def test_identical_duplicates_are_counted_only_once(self):
        data = SubwayList([record(2024, 10), record(2025, 20), record(2025, 20)])
        predictor = CongestionPredictor()
        forecast = predictor.predict_congestion_data(data, 2026, 1)
        self.assertEqual(forecast.items[0].slot_congestion[0], 16.67)
        self.assertEqual(predictor.get_quality_report()["exact_duplicate_records_removed"], 1)

    def test_conflicting_duplicates_are_not_silently_averaged(self):
        data = SubwayList([record(2023, 5), record(2024, 10), record(2025, 20), record(2025, 40)])
        predictor = CongestionPredictor()
        forecast = predictor.predict_congestion_data(data, 2026, 1)
        self.assertEqual(forecast.items[0].slot_congestion[0], 8.33)
        report = predictor.get_quality_report()
        self.assertEqual(report["conflicting_groups_excluded"], 1)
        self.assertEqual(report["conflicting_records_excluded"], 2)

    def test_ambiguous_station_names_not_merged(self):
        data = SubwayList([record(2023, 5), record(2024, 10),
                           record(2025, 20, station_name="Branch A"),
                           record(2025, 20, station_name="Branch B")])
        predictor = CongestionPredictor()
        result = predictor.predict_congestion_data(data, 2026, 1)
        self.assertEqual(result.items[0].slot_congestion[0], 8.33)
        self.assertEqual(predictor.get_quality_report()["conflicting_groups_excluded"], 1)

    def test_missing_identifiers_reported_not_silently_used(self):
        bad = record(2025, 50)
        bad.line = None
        predictor = CongestionPredictor()
        predictor.predict_congestion_data(SubwayList([record(2024, 10), record(2025, 20), bad]), 2026, 1)
        self.assertEqual(predictor.get_quality_report()["invalid_identifier_records"], 1)

    def test_complete_missing_profile_excluded(self):
        data = SubwayList([record(2024, [None] * 39), record(2025, [None] * 39),
                           record(2024, 10, station=2), record(2025, 20, station=2)])
        predictor = CongestionPredictor()
        forecast = predictor.predict_congestion_data(data, 2026, 1)
        self.assertEqual(len(forecast.items), 1)
        self.assertEqual(predictor.get_quality_report()["all_missing_profiles"], 1)


if __name__ == "__main__":
    unittest.main()
