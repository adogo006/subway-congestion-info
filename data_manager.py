import csv

class SubwayData:
    def __init__(self, line, station_code, station_name, day_type, direction, slot_congestion, year, quarter):
        self.line = line
        self.station_code = station_code
        self.station_name = station_name
        self.day_type = day_type
        self.direction = direction
        self.slot_congestion = slot_congestion
        self.year = year
        self.quarter = quarter
    
    def __str__(self):
        return f"[SubwayData]\nline={self.line}, station_code={self.station_code}, station_name='{self.station_name}', day_type='{self.day_type}', direction='{self.direction}', year={self.year}, quarter={self.quarter}\nslot_congestion={self.slot_congestion}"


class SubwayList:
    def __init__(self, items):
        self.items = items

    def __len__(self):
        return len(self.items)
    
    def __add__(self, other):
        if not isinstance(other, SubwayList):
            return NotImplemented

        return SubwayList(self.items + other.items)


class DataConverter:
    @staticmethod
    def load_csv(path):
        rows = []
        with open(path, "r", encoding="utf-8-sig", newline="") as file:
            reader = csv.reader(file)
            # For skipping the first two rows (header rows)
            next(reader, None)
            next(reader, None)

            for row in reader:
                if row and any(value.strip() for value in row):
                    rows.append(row)

        return rows

    @staticmethod
    def parse_data(rows):
        items = []
        for row in rows:
            year = int(row[0])
            day_type = row[1].strip()
            line = int(row[2]) if row[2].strip() else None
            station_code = int(row[3].replace(",", ""))
            station_name = row[4].strip()
            direction = row[5].strip()
            slot_congestion = []
            for value in row[6:45]:
                value = value.strip()
                if value == "" or value == "-":
                    slot_congestion.append(None)
                else:
                    slot_congestion.append(float(value))
            quarter = int(row[45]) if row[45].strip() not in ("", "-") else None

            item = SubwayData(
                line,
                station_code,
                station_name,
                day_type,
                direction,
                slot_congestion,
                year,
                quarter
            )
            items.append(item)
        return SubwayList(items)