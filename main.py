import os

from data_manager import *
from congestion_predictor import *

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, "data/congestion.csv")

    raw_data = DataConverter.load_csv(csv_path)
    subway_list = DataConverter.parse_data(raw_data)

    prediction_calculator = PredictionCalculator()
    predictor = CongestionPredictor(prediction_calculator)

    data_2026_qr4 = predictor.predict_congestion_data(subway_list, 2026, 4)
    data_2027_qr1 = predictor.predict_congestion_data(subway_list, 2027, 1)
    data_2027_qr2 = predictor.predict_congestion_data(subway_list, 2027, 2)
    data_2027_qr3 = predictor.predict_congestion_data(subway_list, 2027, 3)
    data_2027_qr4 = predictor.predict_congestion_data(subway_list, 2027, 4) 

    data = data_2026_qr4 + data_2027_qr1 + data_2027_qr2 + data_2027_qr3 + data_2027_qr4 

    predictor.save_prediction_json(data, os.path.join(base_dir, "data/prediction.json"))
