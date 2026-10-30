import json
from collections import defaultdict
from pathlib import Path

from data_manager.data_manager import SubwayData, SubwayList


CONGESTION_TIME_KEYS = (
    "hh05_mm30_aft",
    "hh06_aft",
    "hh06_mm30_aft",
    "hh07_aft",
    "hh07_mm30_aft",
    "hh08_aft",
    "hh08_mm30_aft",
    "hh09_aft",
    "hh09_mm30_aft",
    "hh10_aft",
    "hh10_mm30_aft",
    "hh11_aft",
    "hh11_mm30_aft",
    "hh12_aft",
    "hh12_mm30_aft",
    "hh13_aft",
    "hh13_mm30_aft",
    "hh14_aft",
    "hh14_mm30_aft",
    "hh15_aft",
    "hh15_mm30_aft",
    "hh16_aft",
    "hh16_mm30_aft",
    "hh17_aft",
    "hh17_mm30_aft",
    "hh18_aft",
    "hh18_mm30_aft",
    "hh19_aft",
    "hh19_mm30_aft",
    "hh20_aft",
    "hh20_mm30_aft",
    "hh21_aft",
    "hh21_mm30_aft",
    "hh22_aft",
    "hh22_mm30_aft",
    "hh23_aft",
    "hh23_mm30_aft",
    "hh00_aft",
    "hh00_mm30_aft",
)


def build_congestion_fields(slot_congestion):
    if not isinstance(slot_congestion, list) or len(slot_congestion) != len(CONGESTION_TIME_KEYS):
        raise ValueError(f"expected {len(CONGESTION_TIME_KEYS)} congestion time slots")

    return {
        time_key: value
        for time_key, value in zip(CONGESTION_TIME_KEYS, slot_congestion)
    }


class PredictionCalculator:
    def build_prediction_data(self, history, target_year, target_quarter):
        if not isinstance(history, SubwayList):
            raise TypeError("history must be a SubwayList")
        if not isinstance(target_year, int) or isinstance(target_year, bool) or target_year < 2000:
            raise ValueError("target_year must be a valid integer year")
        if not isinstance(target_quarter, int) or isinstance(target_quarter, bool) or target_quarter not in (1, 2, 3, 4):
            raise ValueError("target_quarter must be 1, 2, 3 or 4")
        if len(history) == 0:
            raise ValueError("history is empty")

        groups = defaultdict(list)

        for index, record in enumerate(history.items):
            if not isinstance(record, SubwayData):
                raise TypeError(f"Record {index} is not SubwayData")
            if record.year >= target_year:
                raise ValueError(f"Record {index}: historical year must be before target_year")
            if record.quarter != target_quarter:
                raise ValueError(f"Record {index}: history must match target_quarter")
            if not isinstance(record.slot_congestion, list) or len(record.slot_congestion) != 39:
                raise ValueError(f"Record {index}: expected 39 congestion time slots")

            for slot, value in enumerate(record.slot_congestion):
                if value is not None and (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not (float("-inf") < value < float("inf"))
                    or value < 0
                ):
                    raise ValueError(f"Record {index}, slot {slot}: invalid congestion value")

            key = (record.line, record.station_code, record.direction, record.day_type)
            groups[key].append(record)

        predictions = []

        for records in groups.values():
            records.sort(key=lambda item: item.year)
            earliest_year = records[0].year
            latest = records[-1]
            forecast = []

            for slot in range(39):
                weighted_sum = 0.0
                total_weight = 0.0

                for record in records:
                    value = record.slot_congestion[slot]
                    if value is None:
                        continue

                    # Give more recent historical years greater weight.
                    weight = record.year - earliest_year + 1
                    weighted_sum += value * weight
                    total_weight += weight

                if total_weight > 0:
                    forecast.append(round(weighted_sum / total_weight, 2))
                else:
                    forecast.append(None)

            predictions.append(SubwayData(
                line=latest.line,
                station_code=latest.station_code,
                station_name=latest.station_name,
                day_type=latest.day_type,
                direction=latest.direction,
                slot_congestion=forecast,
                year=target_year,
                quarter=target_quarter
            ))

        return SubwayList(predictions)


def save_prediction_json(prediction_data, path):
    if not isinstance(prediction_data, SubwayList):
        raise TypeError("prediction_data must be SubwayList")

    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)

    entries = []
    for item in prediction_data.items:
        entries.append({
            "lnno": item.line,
            "sttn_no": item.station_code,
            "sttn_nm": item.station_name,
            "day": item.day_type,
            "drc": item.direction,
            "yr": item.year,
            "qr": item.quarter,
        })
        entries[-1].update(build_congestion_fields(item.slot_congestion))

    with output.open("w", encoding="utf-8") as file:
        json.dump(entries, file, ensure_ascii=False, indent=2, allow_nan=False)

    return str(output)
