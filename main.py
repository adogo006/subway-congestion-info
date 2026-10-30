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