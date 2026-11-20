"""Backtest predictions without training on the target year's actual data."""

from collections import defaultdict

from congestion_predictor import CongestionPredictor
from prediction_quality import PredictionQualityAnalyzer


def _unique_actuals(records):
    """Exclude ambiguous actuals rather than choosing one arbitrarily."""
    grouped = defaultdict(list)
    for item in records:
        if PredictionQualityAnalyzer.identifiers_valid(item):
            grouped[PredictionQualityAnalyzer.profile_key(item)].append(item)
    result = {}
    for key, group in grouped.items():
        if len({PredictionQualityAnalyzer.record_signature(item) for item in group}) == 1:
            result[key] = group[0]
    return result


def run_backtest(data, target_year=2026, target_quarter=1, calculator=None):
    """Calculate MAE and last-year baseline MAE over the *same* comparable slots."""
    predictor = CongestionPredictor(calculator)
    predicted = predictor.predict_congestion_data(data, target_year, target_quarter)
    report = predictor.get_quality_report()
    eligible_history = predictor.select_congestion_profile(data, target_year, target_quarter)

    latest_by_profile = {}
    for item in eligible_history.items:
        key = PredictionQualityAnalyzer.profile_key(item)
        if key not in latest_by_profile or item.year > latest_by_profile[key].year:
            latest_by_profile[key] = item

    actuals = _unique_actuals([
        item for item in data.items
        if item.year == target_year and item.quarter == target_quarter
    ])
    abs_errors = []
    baseline_errors = []
    compared_profiles = 0
    for forecast in predicted.items:
        key = PredictionQualityAnalyzer.profile_key(forecast)
        actual = actuals.get(key)
        baseline = latest_by_profile.get(key)
        if actual is None or baseline is None:
            continue
        valid_slots = 0
        for i in range(39):
            p = forecast.slot_congestion[i]
            a = actual.slot_congestion[i]
            b = baseline.slot_congestion[i]
            if p is None or a is None or b is None:
                continue
            abs_errors.append(abs(p - a))
            baseline_errors.append(abs(b - a))
            valid_slots += 1
        if valid_slots:
            compared_profiles += 1

    return {
        "target_year": target_year,
        "target_quarter": target_quarter,
        "predicted_profiles": len(predicted.items),
        "compared_profiles": compared_profiles,
        "compared_time_slots": len(abs_errors),
        "mae": round(sum(abs_errors) / len(abs_errors), 4) if abs_errors else None,
        "last_available_year_baseline_mae": (
            round(sum(baseline_errors) / len(baseline_errors), 4) if baseline_errors else None
        ),
        "historical_quality": report,
        "note": "Both MAEs use identical comparable time slots; forecast uses years before target_year only.",
    }
