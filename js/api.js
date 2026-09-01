/**
 * 데이터 조회 / 상태 변경 API 레이어
 * ------------------------------------------------------------------
 * fetchTasks() 는 SharePoint "업무관리" 리스트를 Power Automate HTTP 트리거로
 * 조회해 Task 모델로 변환합니다(아래 mapSharePointItemToTask 참고).
 * updateTaskStatus / updateTaskDates / createTask 는 아직 대응하는 Power
 * Automate 쓰기(Flow)가 없어 useMock=false 상태에서는 기존 REST 스타일
 * 하위 경로를 그대로 호출하도록 남겨두었습니다 — 별도 쓰기용 Flow가
 * 준비되면 그때 맞춰 수정하면 됩니다. 화면(app.js)에서는 이 함수들만
 * 호출하므로 내부 구현이 바뀌어도 UI 코드는 수정할 필요가 없습니다.
 *
 * 실제 useMock / flowUrl 값은 js/config.local.js (SHAREPOINT_CONFIG, git에는
 * 커밋되지 않음. js/config.example.js 참고) 한 곳에서만 관리합니다.
 */

const API_CONFIG = {
  // true = mock data 사용, false = Power Automate(SharePoint) 실데이터 사용.
  // 값은 js/config.local.js 의 SHAREPOINT_CONFIG 에서 가져옵니다. 파일이 없으면
  // (예: git clone 직후 아직 config.local.js를 만들지 않은 경우) 안전하게 mock으로 동작합니다.
  useMock:
    typeof SHAREPOINT_CONFIG !== 'undefined' && typeof SHAREPOINT_CONFIG.useMock === 'boolean'
      ? SHAREPOINT_CONFIG.useMock
      : true,
  // Power Automate "HTTP 요청 수신 시" 트리거 URL. js/config.local.js 에서 설정하세요.
  flowUrl: typeof SHAREPOINT_CONFIG !== 'undefined' && SHAREPOINT_CONFIG.flowUrl ? SHAREPOINT_CONFIG.flowUrl : '',
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
 * mock 모드가 아니면 Power Automate HTTP 트리거를 호출해 SharePoint
 * "업무관리" 리스트 항목을 가져온 뒤 mapSharePointItemToTask() 로 변환합니다.
 * @returns {Promise<Array<Object>>} Task 배열
 */
async function fetchTasks() {
  if (API_CONFIG.useMock) {
    // 실제 네트워크 호출과 유사한 비동기 흐름을 흉내내기 위해 지연을 둡니다.
    await _delay(200);
    return _getMockStore().map((task) => ({ ...task }));
  }

  if (!API_CONFIG.flowUrl) {
    console.error(
      '[api.js] SHAREPOINT_CONFIG.flowUrl 이 비어 있습니다. js/config.local.js 에 Power Automate HTTP 트리거 URL을 설정하세요.'
    );
    throw new Error('Power Automate 연동 URL이 설정되지 않았습니다.');
  }

  let res;
  try {
    // Power Automate HTTP 트리거는 URL 자체에 서명(sig 등)이 포함되어 있으므로
    // 절대 경로를 이어붙이지 않고 flowUrl 을 그대로 호출합니다.
    res = await fetch(API_CONFIG.flowUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch (networkErr) {
    // 브라우저에서 직접 호출 시 CORS 정책에 막히면 fetch 자체가 실패합니다
    // (TypeError: Failed to fetch). 이때는 임의로 우회하지 말고 원인을 확인할 수
    // 있도록 콘솔에 명확히 남깁니다 — Power Automate 트리거의 CORS 허용 설정
    // (또는 별도 프록시)이 필요할 수 있습니다.
    console.error('[api.js] Power Automate Flow 호출 실패 (네트워크 또는 CORS 오류일 수 있음):', networkErr);
    throw new Error(`업무 목록 조회 실패: 네트워크/CORS 오류 (${networkErr.message})`);
  }

  if (!res.ok) {
    console.error(`[api.js] Power Automate Flow 응답 오류: status ${res.status}`);
    throw new Error(`업무 목록 조회 실패 (status: ${res.status})`);
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error('[api.js] Power Automate 응답 JSON 파싱 실패:', parseErr);
    throw new Error('업무 목록 응답을 해석할 수 없습니다.');
  }

  // Power Automate Response 액션에서 SharePoint "Get items" 의 value 배열을
  // 그대로 반환하도록 구성했다면 data 자체가 배열입니다. 혹시 { value: [...] }
  // 형태로 감싸져 오더라도 대응할 수 있게 둘 다 처리합니다.
  const items = Array.isArray(data) ? data : Array.isArray(data?.value) ? data.value : null;
  if (!items) {
    console.error(
      '[api.js] 예상치 못한 응답 형식입니다. Power Automate Response 본문이 배열(또는 { value: [...] })인지 확인하세요.',
      data
    );
    throw new Error('업무 목록 응답 형식이 올바르지 않습니다.');
  }

  return items.map(mapSharePointItemToTask);
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

  const res = await fetch(`${API_CONFIG.flowUrl}/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
  if (!res.ok) {
    throw new Error(`상태 변경 실패 (status: ${res.status})`);
  }
  return res.json();
}

/**
 * 업무의 접수일/마감일을 변경합니다. (간트차트에서 드래그로 일정 조정 시 호출)
 * @param {string} taskId
 * @param {{receivedDate: string, dueDate: string}} dates
 * @returns {Promise<{success: boolean}>}
 */
async function updateTaskDates(taskId, { receivedDate, dueDate }) {
  if (API_CONFIG.useMock) {
    await _delay(150);
    const store = _getMockStore();
    const task = store.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`업무를 찾을 수 없습니다: ${taskId}`);
    }
    task.receivedDate = receivedDate;
    task.dueDate = dueDate;
    return { success: true };
  }

  const res = await fetch(`${API_CONFIG.flowUrl}/tasks/${encodeURIComponent(taskId)}/dates`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receivedDate, dueDate }),
  });
  if (!res.ok) {
    throw new Error(`일정 변경 실패 (status: ${res.status})`);
  }
  return res.json();
}

/**
 * 새 업무를 등록합니다.
 * @param {Object} taskData - 제목/서비스/요청자/계열사/중요도/접수일/마감일/원문 등
 * @returns {Promise<{success: boolean, task: Object}>}
 */
async function createTask(taskData) {
  if (API_CONFIG.useMock) {
    await _delay(150);
    const store = _getMockStore();
    const newTask = {
      status: TASK_STATUS.NEW,
      aiSummary: '',
      todo: [],
      originalLink: '',
      ...taskData,
      id: _generateMockTaskId(store),
    };
    store.push(newTask);
    return { success: true, task: { ...newTask } };
  }

  const res = await fetch(`${API_CONFIG.flowUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskData),
  });
  if (!res.ok) {
    throw new Error(`업무 등록 실패 (status: ${res.status})`);
  }
  return res.json();
}

function _generateMockTaskId(store) {
  const year = new Date().getFullYear();
  const usedNumbers = store.map((t) => {
    const match = t.id.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const nextNumber = (usedNumbers.length ? Math.max(...usedNumbers) : 0) + 1;
  return `T-${year}-${String(nextNumber).padStart(3, '0')}`;
}

/**
 * SharePoint "업무관리" 리스트 컬럼 매핑
 * ------------------------------------------------------------------
 * 확인된 것: ID, Title (SharePoint 리스트가 기본으로 갖는 컬럼)
 * 아래 값은 전부 TEMP_FIELD_MAPPING(미확인) 상태입니다.
 *
 * 실제 내부 필드명 확인 방법:
 *   1) useMock=false 로 두고 화면을 새로고침
 *   2) 브라우저 개발자도구 Console 탭에서 "[api.js] SharePoint 필드 매핑 미확인"
 *      경고와 함께 원본 item 객체가 함께 출력됩니다 (마지막 인자로 rawItem 전달)
 *   3) 해당 값이 들어있는 실제 키(예: field_9, field_10 등)를 확인해
 *      아래 오른쪽 문자열만 교체하세요. (예: service: 'field_9')
 */
const SHAREPOINT_FIELD_MAP = {
  service: 'TEMP_FIELD_MAPPING',
  requester: 'TEMP_FIELD_MAPPING',
  affiliate: 'TEMP_FIELD_MAPPING',
  priority: 'TEMP_FIELD_MAPPING',
  receivedDate: 'TEMP_FIELD_MAPPING',
  dueDate: 'TEMP_FIELD_MAPPING',
  status: 'TEMP_FIELD_MAPPING',
  originalText: 'TEMP_FIELD_MAPPING',
  aiSummary: 'TEMP_FIELD_MAPPING',
  todo: 'TEMP_FIELD_MAPPING',
  originalLink: 'TEMP_FIELD_MAPPING',
};

// 필드별로 한 번만 경고를 남기기 위한 캐시 (매 렌더링마다 콘솔이 도배되는 것을 방지)
const _warnedSharePointFields = new Set();

function _readMappedField(item, taskFieldName) {
  const spFieldName = SHAREPOINT_FIELD_MAP[taskFieldName];
  const value = spFieldName && spFieldName !== 'TEMP_FIELD_MAPPING' ? item[spFieldName] : undefined;

  if (value === undefined || value === null) {
    if (!_warnedSharePointFields.has(taskFieldName)) {
      _warnedSharePointFields.add(taskFieldName);
      console.warn(
        `[api.js] SharePoint 필드 매핑 미확인 또는 값 없음: "${taskFieldName}" ` +
          `(현재 SHAREPOINT_FIELD_MAP.${taskFieldName} = "${spFieldName}"). ` +
          `js/api.js 의 SHAREPOINT_FIELD_MAP 에서 실제 내부 필드명으로 교체하세요. 원본 항목:`,
        item
      );
    }
    return undefined;
  }
  return value;
}

/**
 * SharePoint "Get items" 응답 항목 1건을 기존 Task 모델로 변환합니다.
 * app.js 등 화면 코드는 이 함수의 결과(Task 모델)만 사용하고
 * SharePoint 내부 필드명(field_1 등)을 직접 참조하지 않습니다.
 *
 * 참고: 기존 Task 모델에는 receivedDate(접수일)/dueDate(마감일)만 있고
 * 별도의 startDate 는 없습니다 — 간트차트가 receivedDate를 시작일로 사용하는
 * 기존 구조를 그대로 유지하기 위해 startDate는 추가하지 않았습니다.
 */
function mapSharePointItemToTask(item) {
  const priorityRaw = _readMappedField(item, 'priority');
  const priority = Object.values(TASK_PRIORITY).includes(priorityRaw) ? priorityRaw : TASK_PRIORITY.MEDIUM;

  const statusRaw = _readMappedField(item, 'status');
  const status = Object.values(TASK_STATUS).includes(statusRaw) ? statusRaw : TASK_STATUS.NEW;

  const todoRaw = _readMappedField(item, 'todo');
  const todo = Array.isArray(todoRaw)
    ? todoRaw
    : typeof todoRaw === 'string' && todoRaw.trim()
      ? todoRaw.split(/\r?\n/).filter(Boolean)
      : [];

  const today = formatISODate(new Date());

  return {
    id: `SP-${item.ID}`,
    title: item.Title || '(제목 없음)',
    service: _readMappedField(item, 'service') || '',
    requester: _readMappedField(item, 'requester') || '',
    affiliate: _readMappedField(item, 'affiliate') || '',
    priority,
    receivedDate: _normalizeSharePointDate(_readMappedField(item, 'receivedDate')) || today,
    dueDate: _normalizeSharePointDate(_readMappedField(item, 'dueDate')) || today,
    status,
    originalText: _readMappedField(item, 'originalText') || '',
    aiSummary: _readMappedField(item, 'aiSummary') || '',
    todo,
    originalLink: _readMappedField(item, 'originalLink') || '',
  };
}

/**
 * SharePoint의 ISO 8601 날짜 문자열(예: "2026-08-31T15:00:00Z")을
 * 화면에서 사용하는 "YYYY-MM-DD" 형식으로 변환합니다.
 * (formatISODate 는 js/app.js 에 정의되어 있으며, 두 함수 모두
 * 브라우저의 로컬 시간대 기준으로 날짜를 계산합니다)
 */
function _normalizeSharePointDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
