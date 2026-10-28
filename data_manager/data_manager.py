import csv
import os

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

    def filter_by_line(self, line):
        result = []
        for item in self.items:
            if item.line == line:
                result.append(item)
        return SubwayList(result)

    def filter_by_station_code(self, station_code):
        result = []
        for item in self.items:
            if item.station_code == station_code:
                result.append(item)
        return SubwayList(result)

    def filter_by_station_name(self, station_name):
        result = []
        for item in self.items:
            if item.station_name == station_name:
                result.append(item)
        return SubwayList(result)

    def filter_by_day_type(self, day_type):
        result = []
        for item in self.items:
            if item.day_type == day_type:
                result.append(item)
        return SubwayList(result)

    def filter_by_direction(self, direction):
        result = []
        for item in self.items:
            if item.direction == direction:
                result.append(item)
        return SubwayList(result)

    def filter_by_year(self, year):
        result = []
        for item in self.items:
            if item.year == year:
                result.append(item)
        return SubwayList(result)

    def filter_by_quarter(self, quarter):
        result = []
        for item in self.items:
            if item.quarter == quarter:
                result.append(item)
        return SubwayList(result)

    def __len__(self):
        return len(self.items)


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

if __name__ == "__main__":
    # set the path to the CSV file
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, "[서울교통공사] 지하철혼잡도 정보.csv")

    # load and parse the CSV data
    raw_data = DataConverter.load_csv(csv_path)
    subway_list = DataConverter.parse_data(raw_data)
    print("total data:", len(subway_list))
    
    # !!IMPORTANT!!
    # example usage of the SubwayList class and its filtering methods
    print("\n-------first data of subway list-------")
    first = subway_list.items[0] # this is the way to access the SubwayData object from the SubwayList
    print(first) # it will print the formatted string representation of the SubwayData object
    # or you can access the attributes of the SubwayData object directly (Refer to the lines below)
        # print(first.station_name, first.line, first.year, first.quarter)
        # print(first.slot_congestion[0], first.slot_congestion[1], first.slot_congestion[5])
    
    print("\n-------------filtered data-------------")
    filtered_list = (
        subway_list
        .filter_by_line(2)
        .filter_by_station_name("강남")
        .filter_by_day_type("평일")
        .filter_by_year(2025)
        .filter_by_quarter(1)   # add a filter method as needed
    )
    for item in filtered_list.items:
        print(f"{item}\n")