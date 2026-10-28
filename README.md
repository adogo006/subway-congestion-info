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