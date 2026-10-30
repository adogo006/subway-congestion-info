import csv
import os

# SRP: 지하철 데이터의 속성을 보관하고 문자열로 출력한다.
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

# SRP: 지하철 데이터 목록을 관리하고 필터링한다.
# OCP: SubwayFilter의 matches()를 호출하여, 새로운 필터 조건을 추가해도 기존 filter() 코드를 수정하지 않도록 한다.
class SubwayList:
    def __init__(self, items):
        self.items = items

    def filter(self, condition):
        result = []

        for item in self.items:
            if condition.matches(item):
                result.append(item)

        return SubwayList(result)

    def __len__(self):
        return len(self.items)

# SRP: 필터링 조건을 판별하는 역할을 담당한다.
# OCP: 새로운 필터링 조건이 추가될 때 기존 코드를 수정하지 않고 자식 클래스를 추가하여 확장할 수 있다.
# LSP: 자식 클래스는 matches(item)의 규약에 따라 전달받은 SubwayData에 대해 조건이 맞으면 True, 맞지 않으면 False를 반환한다.
class SubwayFilter:
    def matches(self, item):
        return True

#region Child Filter Classes

class ByYear(SubwayFilter):
    def __init__(self, year):
        self.year = year

    def matches(self, item):
        return item.year == self.year

class ByDayType(SubwayFilter):
    def __init__(self, day_type):
        self.day_type = day_type

    def matches(self, item):
        return item.day_type == self.day_type

class ByLine(SubwayFilter):
    def __init__(self, line):
        self.line = line

    def matches(self, item):
        return item.line == self.line
    
class ByStationCode(SubwayFilter):
    def __init__(self, station_code):
        self.station_code = station_code

    def matches(self, item):
        return item.station_code == self.station_code
    
class ByStationName(SubwayFilter):
    def __init__(self, station_name):
        self.station_name = station_name

    def matches(self, item):
        return item.station_name == self.station_name

class ByQuarter(SubwayFilter):
    def __init__(self, quarter):
        self.quarter = quarter

    def matches(self, item):
        return item.quarter == self.quarter

#endregion

# SRP: CSV 로딩과 파싱이라는 데이터 입력·변환 작업을 담당한다.
# staticmethod를 사용하여 인스턴스 생성 없이 호출한다.
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
    csv_path = os.path.join(base_dir, "data/congestion.csv")

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
        subway_list             # add a filter method as needed
        .filter(ByLine(2)).filter(ByStationName("강남"))
        .filter(ByYear(2025))
        .filter(ByDayType("평일"))
        .filter(ByQuarter(1))   # especially for the quarter, there are lots of None values, so be careful when filtering by quarter
    )
    for item in filtered_list.items:
        print(f"{item}\n")