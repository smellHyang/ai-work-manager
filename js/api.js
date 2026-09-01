/**
 * 데이터 조회 / 상태 변경 API 레이어
 * ------------------------------------------------------------------
 * 지금은 mock data(js/mockData.js) 기반으로 동작하지만,
 * 실제 연동 시에는 아래 두 함수(fetchTasks, updateTaskStatus)의
 * "실제 연동" 분기만 채워 넣으면 됩니다. 화면(app.js)에서는
 * 이 두 함수만 호출하므로 내부 구현이 바뀌어도 UI 코드는 수정할 필요가 없습니다.
 *
 * Power Automate 연동 예정 스펙(협의 예시):
 *  - GET  {API_BASE_URL}/tasks
 *      -> 200 OK, body: Task[] (mockData.js 의 MOCK_TASKS 와 동일한 필드 구조)
 *  - PATCH {API_BASE_URL}/tasks/{id}/status
 *      -> body: { status: "신규" | "확인중" | "진행중" | "보류" | "완료" }
 *      -> 200 OK, body: { success: true }
 */

const API_CONFIG = {
  // true = mock data 사용, false = 실제 API(API_BASE_URL) 호출
  useMock: true,
  // Power Automate HTTP 요청 트리거 URL을 이곳에 채워 넣으세요.
  apiBaseUrl: '',
};

// mock 모드에서 상태 변경이 반영되는 in-memory 저장소 (원본 MOCK_TASKS는 보존)
let _mockStore = null;

function _getMockStore() {
  if (!_mockStore) {
    _mockStore = MOCK_TASKS.map((task) => ({ ...task }));
  }
  return _mockStore;
}

/**
 * 전체 업무 목록을 조회합니다.
 * @returns {Promise<Array<Object>>} Task 배열
 */
async function fetchTasks() {
  if (API_CONFIG.useMock) {
    // 실제 네트워크 호출과 유사한 비동기 흐름을 흉내내기 위해 지연을 둡니다.
    await _delay(200);
    return _getMockStore().map((task) => ({ ...task }));
  }

  const res = await fetch(`${API_CONFIG.apiBaseUrl}/tasks`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`업무 목록 조회 실패 (status: ${res.status})`);
  }
  return res.json();
}

/**
 * 업무 상태를 변경합니다. (드래그앤드롭으로 컬럼 이동 시 호출)
 * @param {string} taskId
 * @param {string} newStatus - TASK_STATUS 값 중 하나
 * @returns {Promise<{success: boolean}>}
 */
async function updateTaskStatus(taskId, newStatus) {
  if (API_CONFIG.useMock) {
    await _delay(150);
    const store = _getMockStore();
    const task = store.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`업무를 찾을 수 없습니다: ${taskId}`);
    }
    task.status = newStatus;
    return { success: true };
  }

  const res = await fetch(`${API_CONFIG.apiBaseUrl}/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
  if (!res.ok) {
    throw new Error(`상태 변경 실패 (status: ${res.status})`);
  }
  return res.json();
}

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
