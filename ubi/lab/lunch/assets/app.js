const NAVER_MAP_CLIENT_ID = "a1hdrm1ahc";
const STORAGE_KEY = "restaurantState";
const MAX_RESTAURANTS_PER_DAY = 5;
const COMPANY = { lat: 37.48526379602344, lng: 126.89275558255044 };
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
let restaurants = [];
let state;
let map;
let storageError = "";
const markers = new Map();
const rows = new Map();

function getWeekStart(date = new Date()) {
  const sunday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return [sunday.getFullYear(), String(sunday.getMonth() + 1).padStart(2, "0"), String(sunday.getDate()).padStart(2, "0")].join("-");
}

function getWeekLabel(date = new Date()) {
  // 일~토 중 목요일이 속한 달과, 그 달에서 몇 번째 목요일인지로 주차를 결정합니다.
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setDate(thursday.getDate() - thursday.getDay() + 4);
  return (thursday.getMonth() + 1) + "월 " + Math.ceil(thursday.getDate() / 7) + "주차";
}

function getState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    if (!(error instanceof SyntaxError)) storageError = "브라우저 저장소를 읽을 수 없습니다.";
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageError = "";
  } catch {
    storageError = "저장할 수 없어 현재 화면에만 선택 표시됩니다. 재접속 시 기록이 사라질 수 있습니다.";
  }
}

function initializeWeeklyState(date = new Date()) {
  const weekStart = getWeekStart(date);
  const saved = getState();
  const current = saved?.weekStart === weekStart ? saved : {};
  const validIds = ids => Array.isArray(ids)
    ? [...new Set(ids.filter(id => restaurants.some(restaurant => restaurant.id === id)))] : [];
  const visitsByDay = DAYS.map((_, day) => validIds(current.visitsByDay?.[day]).slice(0, MAX_RESTAURANTS_PER_DAY));
  // 이전 기록에 저장된 요일이 없어서 방문 요일을 임의로 만들지 않고 선택을 유지함.
  const undatedRestaurantIds = validIds(current.undatedRestaurantIds ?? current.selectedRestaurantIds)
    .filter(id => !visitsByDay.some(ids => ids.includes(id)));
  state = { weekStart, visitsByDay, undatedRestaurantIds };
  saveState();
}

function isRestaurantSelected(id) {
  return state.undatedRestaurantIds.includes(id) || state.visitsByDay.some(ids => ids.includes(id));
}

function selectRestaurant(id, day) {
  if (!restaurants.some(restaurant => restaurant.id === id) || !Number.isInteger(day) || day < 0 || day > 6) return;
  if (state.weekStart !== getWeekStart()) initializeWeeklyState();
  const ids = state.visitsByDay[day];
  if (ids.includes(id)) {
    state.visitsByDay[day] = ids.filter(value => value !== id);
  } else if (ids.length < MAX_RESTAURANTS_PER_DAY) {
    ids.push(id);
    state.undatedRestaurantIds = state.undatedRestaurantIds.filter(value => value !== id);
  } else {
    render(DAYS[day] + "요일은 " + MAX_RESTAURANTS_PER_DAY + "곳을 모두 선택했습니다.");
    return;
  }
  saveState();
  render();
}

function resetState() {
  state = { weekStart: getWeekStart(), visitsByDay: DAYS.map(() => []), undatedRestaurantIds: [] };
  saveState();
  render("이번 주 방문 기록을 초기화했습니다.");
}

// 구면상 두 좌표 사이의 직선거리(m)
function distanceFromCompany(restaurant) {
  const radians = degrees => degrees * Math.PI / 180;
  const a = Math.sin(radians(restaurant.lat - COMPANY.lat) / 2) ** 2
    + Math.cos(radians(COMPANY.lat)) * Math.cos(radians(restaurant.lat))
    * Math.sin(radians(restaurant.lng - COMPANY.lng) / 2) ** 2;
  return 6371088 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function createRestaurantList() {
  const list = document.getElementById("restaurant-list");
  for (const restaurant of restaurants) {
    const row = document.createElement("article");
    row.className = "restaurant-row";
    row.tabIndex = -1;
    row.setAttribute("aria-label", restaurant.name);
    // JSON 값은 textContent로 넣음
    row.innerHTML = '<div class="row-heading"><h3></h3><span class="category"></span><span class="distance"></span></div><p class="foods"><span class="main-food"></span><span class="sub-food"></span></p><div class="visit-line"><span class="visit-summary"></span><div class="day-picker" role="group"></div></div>';
    row.querySelector("h3").textContent = restaurant.name;
    row.querySelector(".category").textContent = restaurant.category;
    row.querySelector(".distance").textContent = distanceFromCompany(restaurant).toFixed(2) + " m";
    row.querySelector(".distance").title = "회사 좌표 기준 직선거리";
    row.querySelector(".main-food").textContent = restaurant.mainFood;
    row.querySelector(".sub-food").textContent = ", " + restaurant.subFood;
    const picker = row.querySelector(".day-picker");
    picker.setAttribute("aria-label", restaurant.name + " 방문 요일");
    const buttons = DAYS.map((label, day) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-button" + (day === 0 ? " sunday" : "");
      button.textContent = label;
      button.setAttribute("aria-label", restaurant.name + " " + label + "요일 방문");
      button.addEventListener("click", () => selectRestaurant(restaurant.id, day));
      picker.append(button);
      return button;
    });
    list.append(row);
    rows.set(restaurant.id, { row, buttons, summary: row.querySelector(".visit-summary") });
  }
  document.getElementById("restaurant-count").textContent = restaurants.length;
}

function focusRestaurant(id) {
  for (const [restaurantId, item] of rows) {
    item.row.classList.toggle("highlighted", restaurantId === id);
  }
  const { row, buttons } = rows.get(id);
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  buttons[0].focus({ preventScroll: true });
}

function createMarker(restaurant) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "restaurant-marker";
  button.addEventListener("click", () => focusRestaurant(restaurant.id));
  if (map) {
    const marker = new naver.maps.Marker({
      map,
      position: new naver.maps.LatLng(restaurant.lat, restaurant.lng),
      title: restaurant.name,
      zIndex: restaurant.id,
      icon: { content: button, anchor: new naver.maps.Point(55, 20) }
    });
    button.addEventListener("mouseenter", () => marker.setZIndex(1000));
    button.addEventListener("mouseleave", () => marker.setZIndex(restaurant.id));
    button.addEventListener("focus", () => marker.setZIndex(1000));
    button.addEventListener("blur", () => marker.setZIndex(restaurant.id));
    markers.set(restaurant.id, { button, marker });
  } else {
    placeSkeletonMarker(button, restaurant);
    markers.set(restaurant.id, { button });
  }
}

function placeSkeletonMarker(element, position) {
  // 실제 지형이 아닌, 회사와 음식점 좌표의 상대적 배치 샘플
  const points = [...restaurants, COMPANY];
  const lats = points.map(item => item.lat);
  const lngs = points.map(item => item.lng);
  element.style.left = (18 + (position.lng - Math.min(...lngs)) / (Math.max(...lngs) - Math.min(...lngs) || 1) * 64) + "%";
  element.style.top = (23 + (Math.max(...lats) - position.lat) / (Math.max(...lats) - Math.min(...lats) || 1) * 40) + "%";
  document.getElementById("map").append(element);
}

function render(message = "") {
  const [year, month, date] = state.weekStart.split("-").map(Number);
  for (const restaurant of restaurants) {
    const { row, buttons, summary } = rows.get(restaurant.id);
    const selected = isRestaurantSelected(restaurant.id);
    const days = DAYS.filter((_, day) => state.visitsByDay[day].includes(restaurant.id));
    row.classList.toggle("visited", selected);
    summary.textContent = days.length ? days.join("·") + "요일 방문"
      : selected ? "기존 방문 · 요일을 선택하세요" : "아직 방문하지 않았어요";
    buttons.forEach((button, day) => {
      const active = state.visitsByDay[day].includes(restaurant.id);
      const visitDate = new Date(year, month - 1, date + day);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      // 제한에 도달해도 안내를 받을 수 있고 기존 선택은 취소할 수 있습니다.
      button.title = (visitDate.getMonth() + 1) + "/" + visitDate.getDate() + " (" + DAYS[day] + ") · "
        + state.visitsByDay[day].length + "/" + MAX_RESTAURANTS_PER_DAY + "곳 · " + (active ? "다시 누르면 취소" : "방문 선택");
    });
    if (!markers.has(restaurant.id)) createMarker(restaurant);
    const { button } = markers.get(restaurant.id);
    button.classList.toggle("selected", selected);
    button.textContent = (selected ? "✓ " : "· ") + restaurant.name;
    button.setAttribute("aria-label", restaurant.name + ", " + (selected ? "이번 주 방문" : "미방문") + ", 목록에서 요일 선택");
  }
  document.getElementById("week-label").textContent = getWeekLabel(new Date(year, month - 1, date));
  document.getElementById("selection-count").textContent = restaurants.filter(item => isRestaurantSelected(item.id)).length + " 곳 방문";
  document.getElementById("daily-limit").textContent = MAX_RESTAURANTS_PER_DAY;
  document.getElementById("status").textContent = storageError || message || "방문 기록은 자동 저장되며 요일별 최대 " + MAX_RESTAURANTS_PER_DAY + "곳까지 선택할 수 있습니다.";
}

function createCompanyMarker() {
  const label = document.createElement("span");
  label.className = "company-marker";
  label.textContent = "⊙ 회사";
  if (map) {
    new naver.maps.Marker({ map, position: new naver.maps.LatLng(COMPANY.lat, COMPANY.lng),
      icon: { content: label, anchor: new naver.maps.Point(32, 16) }, title: "회사" });
  } else {
    placeSkeletonMarker(label, COMPANY);
  }
}

function initMap() {
  if (!window.naver?.maps?.Map) throw new Error("지도 API를 로드할 수 없습니다.");
  const container = document.getElementById("map");
  container.replaceChildren();
  container.classList.remove("skeleton-map");
  markers.clear();
  map = new naver.maps.Map(container, {
    center: new naver.maps.LatLng(COMPANY.lat, COMPANY.lng), zoom: 19
  });
  container.setAttribute("aria-label", "회사 주변 음식점 위치 지도");
  document.getElementById("map-mode").textContent = "NAVER MAPS · 회사 주변 음식점";
  document.getElementById("sample-note").hidden = true;
  createCompanyMarker();
  render();
}

async function start() {
  try {
    const response = await fetch("assets/restaurants.json");
    if (!response.ok) throw new Error("음식점 데이터 로드 실패");
    const data = await response.json();
    if (!Array.isArray(data) || data.some(item => !item || !Number.isInteger(item.id)
      || ![item.name, item.category, item.mainFood, item.subFood].every(value => typeof value === "string")
      || !Number.isFinite(item.lat) || Math.abs(item.lat) > 90
      || !Number.isFinite(item.lng) || Math.abs(item.lng) > 180)
      || new Set(data.map(item => item.id)).size !== data.length) throw new Error("음식점 데이터 형식 오류");
    restaurants = data;
  } catch {
    document.getElementById("status").textContent = "음식점 데이터를 읽지 못했습니다. 정적 웹 서버로 실행하거나 restaurants.json을 확인하세요.";
    document.getElementById("reset-button").disabled = true;
    return;
  }
  initializeWeeklyState();
  createRestaurantList();
  createCompanyMarker();
  render();
  document.getElementById("reset-button").addEventListener("click", resetState);
  if (!NAVER_MAP_CLIENT_ID) return;
  let mapLoadFailed = false;
  const showMapError = (message = "지도 로드 실패 · 네트워크 연결을 확인하세요") => {
    mapLoadFailed = true;
    document.getElementById("map-mode").textContent = message;
    // 인증 실패 시 SDK가 지도를 삭제하므로 destroy()를 다시 호출하지 않음.
    map = null;
    markers.clear();
    const previousContainer = document.getElementById("map");
    const container = previousContainer.cloneNode(false);
    container.removeAttribute("style");
    previousContainer.replaceWith(container);
    container.classList.add("skeleton-map");
    container.setAttribute("aria-label", "지도 연결 실패 시 음식점 상대 배치도");
    createCompanyMarker();
    render();
    document.getElementById("sample-note").hidden = false;
    document.getElementById("sample-note").textContent = "실제 지도가 아닌 상대 배치도입니다. 네이버 Cloud의 Client ID와 Web 서비스 URL을 확인하세요.";
  };
  window.navermap_authFailure = () => showMapError("네이버 지도 인증 실패 · Client ID와 Web 서비스 URL을 확인하세요");
  const script = document.createElement("script");
  script.src = "https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=" + encodeURIComponent(NAVER_MAP_CLIENT_ID);
  script.onload = () => {
    if (mapLoadFailed) return;
    try { initMap(); } catch (error) { console.error("네이버 지도 초기화 실패", error); showMapError("네이버 지도 초기화 실패"); }
  };
  script.onerror = () => showMapError();
  document.head.append(script);
}

start();
