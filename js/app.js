/**
 * 화면 렌더링 / 이벤트 처리
 * 데이터 조회·변경은 반드시 api.js 의 fetchTasks() / updateTaskStatus() 를 통해서만 수행합니다.
 */

const STATUS_COLUMNS = [
  TASK_STATUS.NEW,
  TASK_STATUS.CHECKING,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.ON_HOLD,
  TASK_STATUS.DONE,
];

const STATUS_CLASS_MAP = {
  [TASK_STATUS.NEW]: 'status-new',
  [TASK_STATUS.CHECKING]: 'status-checking',
  [TASK_STATUS.IN_PROGRESS]: 'status-in-progress',
  [TASK_STATUS.ON_HOLD]: 'status-on-hold',
  [TASK_STATUS.DONE]: 'status-done',
};

const PRIORITY_CLASS_MAP = {
  [TASK_PRIORITY.HIGH]: 'priority-high',
  [TASK_PRIORITY.MEDIUM]: 'priority-medium',
  [TASK_PRIORITY.LOW]: 'priority-low',
};

const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_MS = 24 * 60 * 60 * 1000;

let tasks = [];
let selectedTaskId = null;
let draggedTaskId = null;
let ganttWeekOffset = 0;

const boardEl = document.getElementById('board');
const ganttChartEl = document.getElementById('ganttChart');
const ganttRangeEl = document.getElementById('ganttRange');
const detailPanelEl = document.getElementById('detailPanel');
const detailBackdropEl = document.getElementById('detailBackdrop');
const lastUpdatedEl = document.getElementById('lastUpdated');

async function init() {
  await loadTasks();
  bindGlobalEvents();
}

async function loadTasks() {
  try {
    tasks = await fetchTasks();
    render();
  } catch (err) {
    console.error(err);
    boardEl.innerHTML = `<div class="load-error">업무 목록을 불러오지 못했습니다. (${err.message})</div>`;
  }
}

function render() {
  renderGantt();
  renderBoard();
  renderDetailPanel();
  lastUpdatedEl.textContent = `마지막 갱신: ${formatDateTime(new Date())}`;
}

function getWeekStart(offsetWeeks) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday + offsetWeeks * 7);
  return monday;
}

function renderGantt() {
  const weekStart = getWeekStart(ganttWeekOffset);
  const weekStartTime = weekStart.getTime();
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStartTime + i * DAY_MS));
  const weekEndExclusive = weekStartTime + 7 * DAY_MS;
  const todayStr = formatISODate(new Date());

  ganttRangeEl.textContent = `${formatShortDate(weekDays[0])} - ${formatShortDate(weekDays[6])}`;

  const headerHtml = `
    <div class="gantt-head-row">
      <div class="gantt-head-label"></div>
      ${weekDays
        .map((d, i) => {
          const iso = formatISODate(d);
          return `
        <div class="gantt-head-day ${iso === todayStr ? 'is-today' : ''} ${i >= 5 ? 'is-weekend' : ''}">
          <div class="dow">${DOW_LABELS[i]}</div>
          <div class="dnum">${d.getDate()}</div>
        </div>`;
        })
        .join('')}
    </div>
  `;

  const rowTasks = tasks
    .filter((t) => {
      const start = new Date(t.receivedDate).getTime();
      const end = new Date(t.dueDate).getTime() + DAY_MS;
      return end > weekStartTime && start < weekEndExclusive;
    })
    .sort((a, b) => (a.receivedDate < b.receivedDate ? -1 : 1));

  const bodyHtml =
    rowTasks.length === 0
      ? `<div class="gantt-empty">이번 주에 해당하는 업무가 없습니다.</div>`
      : rowTasks
          .map((t) => {
            const start = new Date(t.receivedDate).getTime();
            const end = new Date(t.dueDate).getTime() + DAY_MS;
            const startIdx = Math.max(0, (start - weekStartTime) / DAY_MS);
            const endIdx = Math.min(7, (end - weekStartTime) / DAY_MS);
            const left = (startIdx / 7) * 100;
            const width = Math.max(((endIdx - startIdx) / 7) * 100, (100 / 7) * 0.4);
            const clipStart = start < weekStartTime;
            const clipEnd = end > weekEndExclusive;

            return `
          <div class="gantt-row">
            <div class="gantt-row-label">
              <span class="row-priority-dot ${PRIORITY_CLASS_MAP[t.priority]}"></span>
              <span>${escapeHtml(t.title)}</span>
            </div>
            <div class="gantt-row-track">
              <div class="gantt-bar ${STATUS_CLASS_MAP[t.status]} ${clipStart ? 'clip-start' : ''} ${
                clipEnd ? 'clip-end' : ''
              }"
                   style="left:${left}%;width:${width}%"
                   data-task-id="${t.id}"
                   title="${escapeAttr(t.title)} (${t.receivedDate} ~ ${t.dueDate})">
                ${escapeHtml(t.title)}
              </div>
            </div>
          </div>`;
          })
          .join('');

  ganttChartEl.innerHTML = `${headerHtml}<div class="gantt-body">${bodyHtml}</div>`;

  ganttChartEl.querySelectorAll('.gantt-bar').forEach((bar) => {
    bar.addEventListener('click', () => openDetailPanel(bar.dataset.taskId));
  });
}

function renderBoard() {
  boardEl.innerHTML = '';

  STATUS_COLUMNS.forEach((status) => {
    const columnTasks = tasks
      .filter((t) => t.status === status)
      .sort((a, b) => (a.receivedDate < b.receivedDate ? 1 : -1));

    const column = document.createElement('div');
    column.className = `column ${STATUS_CLASS_MAP[status]}`;
    column.dataset.status = status;

    column.innerHTML = `
      <div class="column-header">
        <span class="column-title">${status}</span>
        <span class="column-count">${columnTasks.length}</span>
      </div>
      <div class="column-body" data-status="${status}"></div>
    `;

    const body = column.querySelector('.column-body');
    columnTasks.forEach((task) => body.appendChild(createTaskCard(task)));

    bindColumnDropEvents(body);
    boardEl.appendChild(column);
  });
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.taskId = task.id;
  if (task.id === selectedTaskId) card.classList.add('selected');

  card.innerHTML = `
    <div class="task-card-top">
      <span class="priority-badge ${PRIORITY_CLASS_MAP[task.priority]}">${task.priority}</span>
      <span class="task-id">${task.id}</span>
    </div>
    <div class="task-title">${escapeHtml(task.title)}</div>
    <div class="task-meta">
      <span class="task-service">${escapeHtml(task.service)}</span>
    </div>
    <div class="task-meta task-meta-secondary">
      <span>${escapeHtml(task.affiliate)}</span>
      <span>·</span>
      <span>${escapeHtml(task.requester)}</span>
    </div>
    <div class="task-footer">
      <span class="task-date">접수일 ${task.receivedDate}</span>
    </div>
  `;

  card.addEventListener('click', () => openDetailPanel(task.id));
  card.addEventListener('dragstart', (e) => {
    draggedTaskId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedTaskId = null;
  });

  return card;
}

function bindColumnDropEvents(bodyEl) {
  bodyEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    bodyEl.parentElement.classList.add('drag-over');
  });
  bodyEl.addEventListener('dragleave', (e) => {
    if (!bodyEl.parentElement.contains(e.relatedTarget)) {
      bodyEl.parentElement.classList.remove('drag-over');
    }
  });
  bodyEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    bodyEl.parentElement.classList.remove('drag-over');
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    const newStatus = bodyEl.dataset.status;
    if (taskId) await handleStatusChange(taskId, newStatus);
  });
}

async function handleStatusChange(taskId, newStatus) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status === newStatus) return;

  const prevStatus = task.status;
  task.status = newStatus; // optimistic update
  render();

  try {
    await updateTaskStatus(taskId, newStatus);
  } catch (err) {
    console.error(err);
    task.status = prevStatus; // rollback
    render();
    alert(`상태 변경에 실패했습니다: ${err.message}`);
  }
}

function openDetailPanel(taskId) {
  selectedTaskId = taskId;
  render();
  detailPanelEl.classList.add('open');
  detailBackdropEl.classList.add('visible');
}

function closeDetailPanel() {
  selectedTaskId = null;
  detailPanelEl.classList.remove('open');
  detailBackdropEl.classList.remove('visible');
  document.querySelectorAll('.task-card.selected').forEach((el) => el.classList.remove('selected'));
}

function renderDetailPanel() {
  const task = tasks.find((t) => t.id === selectedTaskId);
  if (!task) {
    detailPanelEl.innerHTML = '';
    return;
  }

  detailPanelEl.innerHTML = `
    <div class="detail-header">
      <div>
        <span class="priority-badge ${PRIORITY_CLASS_MAP[task.priority]}">${task.priority}</span>
        <span class="detail-task-id">${task.id}</span>
      </div>
      <button class="detail-close" type="button" aria-label="닫기">&times;</button>
    </div>

    <h2 class="detail-title">${escapeHtml(task.title)}</h2>

    <div class="detail-meta-grid">
      <div class="detail-meta-item"><span class="meta-label">서비스</span><span>${escapeHtml(task.service)}</span></div>
      <div class="detail-meta-item"><span class="meta-label">계열사</span><span>${escapeHtml(task.affiliate)}</span></div>
      <div class="detail-meta-item"><span class="meta-label">요청자</span><span>${escapeHtml(task.requester)}</span></div>
      <div class="detail-meta-item"><span class="meta-label">접수일</span><span>${task.receivedDate}</span></div>
    </div>

    <div class="detail-status-row">
      <span class="meta-label">상태</span>
      <select id="detailStatusSelect" class="status-select ${STATUS_CLASS_MAP[task.status]}">
        ${STATUS_COLUMNS.map(
          (s) => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">마감일</div>
      <div class="detail-due-date">${task.dueDate || '-'}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">AI 요약</div>
      <div class="detail-ai-summary">${escapeHtml(task.aiSummary || '-')}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">해야할 일</div>
      <ul class="detail-todo-list">
        ${(task.todo || [])
          .map(
            (item, idx) => `
          <li>
            <label>
              <input type="checkbox" data-todo-idx="${idx}" />
              <span>${escapeHtml(item)}</span>
            </label>
          </li>`
          )
          .join('')}
      </ul>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">원문</div>
      <div class="detail-original-text">${escapeHtml(task.originalText || '-')}</div>
    </div>

    <div class="detail-section">
      <a class="detail-original-link" href="${escapeAttr(task.originalLink)}" target="_blank" rel="noopener noreferrer">
        원본 바로가기 &#8599;
      </a>
    </div>
  `;

  detailPanelEl.querySelector('.detail-close').addEventListener('click', closeDetailPanel);
  detailPanelEl
    .querySelector('#detailStatusSelect')
    .addEventListener('change', (e) => handleStatusChange(task.id, e.target.value));
}

function bindGlobalEvents() {
  detailBackdropEl.addEventListener('click', closeDetailPanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailPanel();
  });

  document.getElementById('ganttPrevWeek').addEventListener('click', () => {
    ganttWeekOffset -= 1;
    renderGantt();
  });
  document.getElementById('ganttNextWeek').addEventListener('click', () => {
    ganttWeekOffset += 1;
    renderGantt();
  });
  document.getElementById('ganttToday').addEventListener('click', () => {
    ganttWeekOffset = 0;
    renderGantt();
  });
}

function formatDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatShortDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function formatISODate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

document.addEventListener('DOMContentLoaded', init);
