// 실행: node src/assets/app.test.cjs (추가 패키지 불필요)
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const stored = new Map();
const elements = new Map();
function element() {
  const children = new Map();
  const attributes = new Map();
  const classes = new Set();
  return {
    style: {}, classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } }, textContent: "",
    scrollIntoView() {}, focus() {},
    setAttribute(key, value) { attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key); },
    addEventListener() {}, append() {},
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    }
  };
}
const context = vm.createContext({
  console,
  window: {},
  fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(__dirname + "/restaurants.json", "utf8")) }),
  localStorage: {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  },
  document: {
    head: { append() {} },
    createElement: element,
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  }
});
const run = source => vm.runInContext(source, context);
const saved = () => JSON.parse(stored.get("restaurantState"));

(async () => {
  await run(fs.readFileSync(__dirname + "/app.js", "utf8"));
  assert.equal(elements.get("restaurant-count").textContent, 12);
  const stateBeforeFocus = JSON.stringify(saved());
  run("focusRestaurant(1); focusRestaurant(2)");
  assert.equal(run("rows.get(1).row.classList.contains('highlighted')"), false);
  assert.equal(run("rows.get(2).row.classList.contains('highlighted')"), true);
  assert.equal(JSON.stringify(saved()), stateBeforeFocus);
  assert.equal(run("getWeekStart(new Date(2026, 8, 12, 23, 59))"), "2026-09-06");
  assert.equal(run("getWeekStart(new Date(2026, 8, 13, 0, 0))"), "2026-09-13");
  assert.equal(run("getWeekStart(new Date(2026, 8, 14))"), "2026-09-13");
  assert.equal(run("getWeekStart(new Date(2027, 0, 1))"), "2026-12-27");
  assert.equal(run("getWeekLabel(new Date(2023, 8, 1))"), "8월 5주차"); // 금요일
  assert.equal(run("getWeekLabel(new Date(2022, 8, 1))"), "9월 1주차"); // 목요일
  assert.equal(run("getWeekLabel(new Date(2026, 8, 8))"), "9월 2주차");
  assert.equal(run("getWeekLabel(new Date(2027, 0, 1))"), "12월 5주차");
  for (let date = 28; date <= 34; date++) {
    assert.equal(run("getWeekLabel(new Date(2022, 7, " + date + "))"), "9월 1주차");
  }
  assert.equal(run("distanceFromCompany(COMPANY)"), 0);
  assert.ok(Math.abs(run("distanceFromCompany({lat: COMPANY.lat + 1, lng: COMPANY.lng})") - 111196.48) < 0.1);
  assert.equal(run("MAX_RESTAURANTS_PER_DAY"), 5);
  assert.equal(elements.get("daily-limit").textContent, 5);
  run("[1, 2, 3, 4, 5, 6].forEach(id => selectRestaurant(id, 1))");
  assert.deepEqual(saved().visitsByDay[1], [1, 2, 3, 4, 5]);
  assert.match(elements.get("status").textContent, /최대 5곳/);
  assert.match(run("rows.get(1).buttons[1].title"), /5\/5곳/);
  run("selectRestaurant(1, 2)");
  assert.equal(elements.get("selection-count").textContent, "5 곳 방문");
  run("initializeWeeklyState(); render()");
  assert.deepEqual(saved().visitsByDay[1], [1, 2, 3, 4, 5]);
  assert.deepEqual(saved().visitsByDay[2], [1]);
  run("selectRestaurant(1, 1); selectRestaurant(6, 1)");
  assert.deepEqual(saved().visitsByDay[1], [2, 3, 4, 5, 6]);
  assert.equal(run("isRestaurantSelected(1)"), true);
  assert.equal(elements.get("selection-count").textContent, "6 곳 방문");
  run("selectRestaurant(1, 2)");
  assert.equal(run("isRestaurantSelected(1)"), false);
  const before = JSON.stringify(saved());
  run('selectRestaurant(999, 1); selectRestaurant(1, -1); selectRestaurant(1, 7); selectRestaurant(1, "1")');
  assert.equal(JSON.stringify(saved()), before);
  // 모든 요일의 선택 한도가 서로 독립적인지 확인합니다.
  run("resetState()");
  for (let day = 0; day < 7; day++) run("[1, 2, 3, 4, 5, 6].forEach(id => selectRestaurant(id, " + day + "))");
  assert.ok(saved().visitsByDay.every(ids => JSON.stringify(ids) === "[1,2,3,4,5]"));
  run("resetState()");
  assert.ok(saved().visitsByDay.every(ids => ids.length === 0));
  assert.equal(elements.get("selection-count").textContent, "0 곳 방문");
  stored.set("restaurantState", JSON.stringify({ weekStart: "2026-09-06", visitsByDay: [[1], [2]], undatedRestaurantIds: [3] }));
  run("initializeWeeklyState(new Date(2026, 8, 12, 23, 59)); render()");
  assert.deepEqual(saved().visitsByDay[0], [1]);
  assert.equal(run("rows.get(1).buttons[0].title.split(' · ')[0]"), "9/6 (일)");
  assert.equal(run("rows.get(1).buttons[6].title.split(' · ')[0]"), "9/12 (토)");
  assert.equal(elements.get("week-label").textContent, "9월 2주차");
  run("initializeWeeklyState(new Date(2026, 8, 13))");
  assert.equal(saved().weekStart, "2026-09-13");
  assert.ok(saved().visitsByDay.every(ids => ids.length === 0));
  assert.deepEqual(saved().undatedRestaurantIds, []);
  stored.set("restaurantState", "{broken");
  run("initializeWeeklyState()");
  assert.deepEqual(saved().undatedRestaurantIds, []);
  stored.set("restaurantState", JSON.stringify({ weekStart: run("getWeekStart()"), selectedRestaurantIds: [1, 1, 2, "3", 999, null] }));
  run("initializeWeeklyState(); render()");
  assert.deepEqual(saved().undatedRestaurantIds, [1, 2]);
  assert.equal(elements.get("selection-count").textContent, "2 곳 방문");
  run("selectRestaurant(1, 0)");
  assert.deepEqual(saved().visitsByDay[0], [1]);
  assert.deepEqual(saved().undatedRestaurantIds, [2]);
  stored.set("restaurantState", JSON.stringify({ weekStart: run("getWeekStart()"), visitsByDay: [[1, 1, 2, 3, "4", 4, 5, 6], "invalid"], undatedRestaurantIds: [1, 6] }));
  run("initializeWeeklyState()");
  assert.deepEqual(saved().visitsByDay[0], [1, 2, 3, 4, 5]);
  assert.deepEqual(saved().visitsByDay[1], []);
  assert.deepEqual(saved().undatedRestaurantIds, [6]);
  run('localStorage.setItem = () => { throw new Error("blocked"); }; selectRestaurant(3, 2)');
  assert.equal(run("isRestaurantSelected(3)"), true);
  assert.match(elements.get("status").textContent, /저장할 수 없어/);
  console.log("PASS: seven daily limits, toggle, unique count, restore, reset, week boundaries, legacy migration, invalid data, distance, storage failure");
})().catch(error => { console.error(error); process.exitCode = 1; });
