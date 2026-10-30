from data_manager import *
from congestion_predictor import *

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, "data/congestion.csv")

    raw_data = DataConverter.load_csv(csv_path)
    subway_list = DataConverter.parse_data(raw_data)

    prediction_calculator = PredictionCalculator()
    predictor = CongestionPredictor(prediction_calculator)
    data_2027_1 = predictor.predict_congestion_data(subway_list, 2027, 1)
    data_2027_2 = predictor.predict_congestion_data(subway_list, 2027, 2)
    data_2027_3 = predictor.predict_congestion_data(subway_list, 2027, 3)
    data_2027_4 = predictor.predict_congestion_data(subway_list, 2027, 4)

    data = data_2027_1 + data_2027_2 + data_2027_3 + data_2027_4
    predictor.save_prediction_json(data, os.path.join(base_dir, "data/prediction.json"))

    # 예측 데이터에서 분기값이 비어있어도 에러가 아닌 유연한 처리 필요(이전 또는 이후 데이터 참조 등의 방법으로)
    # predictor 와 calculator 부분은 클래스 디자인 설계로 수정 소요 필요
    # 현재는 js에서 데이터셋의 일반화로 요소들을 대응시키고 있지만, 백엔드 파이썬 데이터 매니저가 해당 데이터들의 요소들을 일반화하는 기능이 있으면 좋을 것 같음.
    # 즉, 데이터 매니저가 각 데이터셋의 요소들을 일반화(열 이름이 아닌 열 안에 값들의 일반화 ex. 역이름 역번호 그자체 값의 일반화)
    # modal 창은 따로 현재 사용할 수 있는 데이터를 고려하여 새롭게 디자인해서 다시 구현하는게 좋을 것 같음.
    # 미래 예측 데이터를 만들때 한번에 만들지 지금처럼 분기별로 만들고 이를 토글링할지 결정해야됨.
    # 현재는 단순하게 가장 최신년도 최신분기의 혼잡도 예측 값을 대쉬보드에 히트맵으로 표현 중
    # 나중에 csv 파일을 json하나로 통일하든 데이터셋을 통일할 수 있으면 좋을 것 같음.