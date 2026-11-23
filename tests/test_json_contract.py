import json
import tempfile
import unittest
from pathlib import Path

from congestion_predictor import CongestionPredictor
from data_manager import SubwayList
from prediction_calculator import CONGESTION_TIME_KEYS
from tests.test_congestion_predictor import record


class TestDashboardJsonContract(unittest.TestCase):
    def test_json_uses_dashboard_prediction_schema(self):
        p = CongestionPredictor()
        predicted = p.predict_congestion_data(
            SubwayList([record(2024, 10), record(2025, 20)]), 2026, 1)
        with tempfile.TemporaryDirectory() as folder:
            out = p.save_prediction_json(predicted, str(Path(folder) / "prediction.json"))
            entries = json.loads(Path(out).read_text(encoding="utf-8"))
        self.assertEqual(len(entries), 1)
        item = entries[0]
        self.assertEqual(set(item), {
            "lnno", "sttn_no", "sttn_nm", "day", "drc", "yr", "qr",
            *CONGESTION_TIME_KEYS,
        })
        self.assertEqual((item["yr"], item["qr"]), (2026, 1))
        self.assertEqual(len(CONGESTION_TIME_KEYS), 39)


if __name__ == "__main__":
    unittest.main()
