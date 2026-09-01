/**
 * Power Automate / SharePoint 연동 설정 템플릿
 * ------------------------------------------------------------------
 * 1) 이 파일을 같은 폴더에 "config.local.js" 라는 이름으로 복사하세요.
 *    (js/config.local.js 는 .gitignore 에 등록되어 있어 Power Automate URL이
 *    실수로 git에 커밋되지 않습니다)
 * 2) flowUrl 에 Power Automate "HTTP 요청 수신 시" 트리거의 URL을 붙여넣으세요.
 * 3) useMock 을 false 로 바꾸면 화면이 mock data 대신 실제 SharePoint 데이터를 사용합니다.
 *
 * js/config.local.js 가 없으면(useMock 값을 알 수 없으면) api.js는 안전하게
 * useMock: true 로 동작합니다 — 즉 이 파일을 복사하지 않아도 앱은 정상 실행됩니다.
 */
const SHAREPOINT_CONFIG = {
  useMock: true,
  flowUrl: '',
};
