# 1. [Congestion Predictor fix point]
* I updated CongestionPredictor for the final project. My module checks and selects historical subway data before passing it to PredictionCalculator.

* For the final version, I added:
Checks for insufficient historical data for individual stations.
Detection of duplicate and conflicting records.
Data quality reports showing which records were used or excluded.
Backtesting to compare predictions with actual historical data.
Automated tests and improved class design.
These changes help prevent unreliable data from affecting predictions while keeping the calculation logic separate.

All 15 tests passed, and the updated code runs successfully with the real dataset.

지금 마지막 수정이후 이분들이 한거
- 불충분한 과거 데이터 점검???
- 중복되고 충돌되는 기록 감지??
- 데이터 품질 보고서(해당 데이터가 사용되었는지 안되었는지)
- 

# 2. [DashBoard Manager]
# 1. [Congestion Predictor fix point]
# 1. [Congestion Predictor fix point]