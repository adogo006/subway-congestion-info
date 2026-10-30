
# 수정이 필요한 사항

## 예측 데이터에서 분기값이 비어있어도 에러가 아닌 유연한 처리 필요(이전 또는 이후 데이터 참조 등의 방법으로)
## predictor 와 calculator 부분은 클래스 디자인 설계로 수정 소요 필요
## 현재는 js에서 데이터셋의 일반화로 요소들을 대응시키고 있지만, 백엔드 파이썬 데이터 매니저가 해당 데이터들의 요소들을 일반화하는 기능이 있으면 좋을 것 같음.
## 즉, 데이터 매니저가 각 데이터셋의 요소들을 일반화(열 이름이 아닌 열 안에 값들의 일반화 ex. 역이름 역번호 그자체 값의 일반화)
## modal 창은 따로 현재 사용할 수 있는 데이터를 고려하여 새롭게 디자인해서 다시 구현하는게 좋을 것 같음.
## 미래 예측 데이터를 만들때 한번에 만들지 지금처럼 분기별로 만들고 이를 토글링할지 결정해야됨.
## 현재는 단순하게 가장 최신년도 최신분기의 혼잡도 예측 값을 대쉬보드에 히트맵으로 표현 중
## 나중에 csv 파일을 json하나로 통일하든 데이터셋을 통일할 수 있으면 좋을 것 같음.





# Subway congestion info
## JavaScript 뼈대 사용법

주요 화면 로직은 [`index/index.js`](./index/index.js)에 네 개의 클래스로 나뉘어
있습니다.

- `DataManager`: JSON 파일을 읽고 현재 필터에 맞는 배열을 반환합니다.
- `MapRenderer`: SVG 노선과 역 점을 그립니다.
- `ModalManager`: 역을 클릭했을 때 상세 정보와 간단한 막대 차트를 표시합니다.
- `UIManager`: 요일, 시간, 노선, 방향, 역 선택 상태를 관리합니다.

HTML에 다음처럼 연결할 수 있습니다.

```html
<div id="map"></div>
<button id="heat-map-button">히트맵</button>
<section id="station-modal" hidden>
  <h2 id="modal-title"></h2>
  <div id="modal-content"></div>
</section>
<script src="./index.js"></script>
<script>
  const dataManager = new SubwayDashboard.DataManager({
    congestion: "./data/congestion.json",
    prediction: "./data/prediction.json",
    station: "./data/station.json",
  });

  const modalManager = new SubwayDashboard.ModalManager({
    modal: "#station-modal",
    title: "#modal-title",
    content: "#modal-content",
  });

  const uiManager = new SubwayDashboard.UIManager({ dataManager, modalManager });
  const mapRenderer = new SubwayDashboard.MapRenderer({
    container: "#map",
    dataManager,
    onStationClick: (station) => uiManager.click_station(station),
  });
  uiManager.mapRenderer = mapRenderer;

  dataManager.load_all().then(() => uiManager.refresh());
</script>
```

각 JSON 항목은 적어도 `day_type`, `time`, `line`, `direction`,
`station_code` 필드를 가질 수 있습니다. 역 데이터는 `station_name`과
`congestion` 또는 `congestion_history` 필드를 사용합니다.

필터를 변경할 때는 다음 메서드를 호출합니다.

```js
uiManager.toggle_day_type("weekday");
uiManager.wheelpicker_time("08:00");
uiManager.toggle_line(2);
uiManager.toggle_direction("up");
```

