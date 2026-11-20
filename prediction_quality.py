"""Inspect and prepare historical subway data without calculating forecasts."""

from collections import defaultdict

from data_manager import SubwayList


class PredictionQualityAnalyzer:
    """Apply conservative quality rules before forecasting.

    A profile is identified exactly as in PredictionCalculator:
    (line, station_code, direction, day_type).
    Records with the same profile/year/quarter but differing data are
    reported as conflicts rather than silently averaged or overwritten.
    """

    def __init__(self, minimum_years=2):
        if not isinstance(minimum_years, int) or isinstance(minimum_years, bool) or minimum_years < 1:
            raise ValueError("minimum_years must be a positive integer")
        self.minimum_years = minimum_years

    @staticmethod
    def profile_key(item):
        return (item.line, item.station_code, item.direction, item.day_type)

    @staticmethod
    def record_signature(item):
        return (item.station_name, tuple(item.slot_congestion))

    @staticmethod
    def identifiers_valid(item):
        return (
            isinstance(item.line, int) and not isinstance(item.line, bool) and item.line > 0
            and isinstance(item.station_code, int) and not isinstance(item.station_code, bool)
            and item.station_code > 0
            and isinstance(item.station_name, str) and bool(item.station_name.strip())
            and isinstance(item.direction, str) and bool(item.direction.strip())
            and isinstance(item.day_type, str) and bool(item.day_type.strip())
        )

    def prepare(self, data, target_year, target_quarter):
        """Return (clean historical SubwayList, JSON-serializable quality report)."""
        candidates = [item for item in data.items if item.quarter == target_quarter and item.year < target_year]
        grouped_by_year = defaultdict(list)
        all_profiles = set()
        invalid_identifiers = 0
        for item in candidates:
            if not self.identifiers_valid(item):
                invalid_identifiers += 1
                continue
            profile = self.profile_key(item)
            all_profiles.add(profile)
            grouped_by_year[(profile, item.year)].append(item)

        clean_groups = defaultdict(list)
        duplicate_records = 0
        conflicting_groups = 0
        conflicting_records = 0
        conflicts_sample = []
        for (profile, year), records in grouped_by_year.items():
            unique_signatures = {self.record_signature(item) for item in records}
            if len(unique_signatures) == 1:
                duplicate_records += len(records) - 1
                clean_groups[profile].append(records[0])
            else:
                conflicting_groups += 1
                conflicting_records += len(records)
                if len(conflicts_sample) < 10:
                    conflicts_sample.append({
                        "line": profile[0], "station_code": profile[1],
                        "direction": profile[2], "day_type": profile[3],
                        "year": year, "records": len(records),
                    })

        history = []
        insufficient_history = 0
        empty_profiles = 0
        missing_values = 0
        weak_time_slots = 0
        years_distribution = defaultdict(int)
        for profile in sorted(all_profiles, key=lambda p: (str(p[0]), str(p[1]), str(p[2]), str(p[3]))):
            records = clean_groups.get(profile, [])
            year_count = len({record.year for record in records})
            if year_count < self.minimum_years:
                insufficient_history += 1
                continue
            if all(value is None for record in records for value in record.slot_congestion):
                empty_profiles += 1
                continue
            years_distribution[str(year_count)] += 1
            records.sort(key=lambda item: item.year)
            history.extend(records)
            missing_values += sum(value is None for record in records for value in record.slot_congestion)
            weak_time_slots += sum(
                sum(record.slot_congestion[slot] is not None for record in records) < 2
                for slot in range(39)
            )

        eligible_profiles = len(all_profiles) - insufficient_history - empty_profiles
        report = {
            "target_year": target_year,
            "target_quarter": target_quarter,
            "minimum_years": self.minimum_years,
            "candidate_records": len(candidates),
            "candidate_profiles_with_valid_identifiers": len(all_profiles),
            "eligible_profiles": eligible_profiles,
            "insufficient_history_profiles": insufficient_history,
            "all_missing_profiles": empty_profiles,
            "invalid_identifier_records": invalid_identifiers,
            "exact_duplicate_records_removed": duplicate_records,
            "conflicting_groups_excluded": conflicting_groups,
            "conflicting_records_excluded": conflicting_records,
            "missing_values_in_selected_history": missing_values,
            "selected_profile_slots_with_fewer_than_two_values": weak_time_slots,
            "eligible_profiles_by_historical_year_count": dict(sorted(years_distribution.items())),
            "conflicts_sample": conflicts_sample,
        }
        return SubwayList(history), report
