"""Run real-data validation and save reports (does not rewrite prediction.json)."""

import json
from pathlib import Path

from congestion_predictor import CongestionPredictor
from data_manager import DataConverter
from prediction_backtest import run_backtest


def main():
    base = Path(__file__).resolve().parent
    csv_path = base / "data" / "congestion.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Expected source file: {csv_path}")
    raw = DataConverter.load_csv(str(csv_path))
    data = DataConverter.parse_data(raw)
    results = {"quality_by_quarter_2027": {}, "backtesting_2026_Q1": None}
    for quarter in (1, 2, 3, 4):
        predictor = CongestionPredictor()
        predicted = predictor.predict_congestion_data(data, 2027, quarter)
        results["quality_by_quarter_2027"][str(quarter)] = predictor.get_quality_report()
        print(f"2027 Q{quarter}: {len(predicted.items)} predicted profiles")
    results["backtesting_2026_Q1"] = run_backtest(data, 2026, 1)
    report_path = base / "reports" / "prediction_quality_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    backtest = results["backtesting_2026_Q1"]
    print(f"Backtest compared profiles: {backtest['compared_profiles']}")
    print(f"Backtest slots: {backtest['compared_time_slots']}")
    print(f"MAE: {backtest['mae']}")
    print(f"Baseline MAE: {backtest['last_available_year_baseline_mae']}")
    print(f"Full report: {report_path}")


if __name__ == "__main__":
    main()
