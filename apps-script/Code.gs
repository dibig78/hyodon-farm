/**
 * 효돈농원 직거래 주문 접수 — Google Apps Script 웹앱
 * ------------------------------------------------------------
 * 하는 일
 *   1) 홈페이지(index.html)에서 보낸 주문 JSON을 받아
 *   2) 스프레드시트 '효돈농원 직거래 주문 접수' 맨 아래에 한 줄로 추가합니다.
 *   3) 주문일시는 한국 시간(KST)으로 기록합니다.
 *   4) 관리자 페이지(admin.html)용 목록 조회(?action=list)와
 *      입금확인·송장번호 업데이트(action=update)도 처리합니다.
 *      관리자 기능은 관리자 키(ADMIN_KEY) 또는 OWNER_EMAIL과 같은 Google 계정으로
 *      로그인했을 때 동작합니다. 관리자 페이지는 fetch로 불러오기 때문에
 *      Google 계정 로그인 방식이 브라우저에서 막힐 수 있어, 키 방식을 씁니다.
 *
 * 설치 방법은 같은 저장소의 apps-script/README.md 를 보세요.
 * ------------------------------------------------------------
 */

/** 주문을 받을 스프레드시트 ID (이미 만들어 둔 시트) */
var SHEET_ID = '1iMgUyWzZopJ8KZfKmVV93FtNlLao4XFNtCK3xekgfeA';

/** 주문을 쌓을 탭 이름. 비워 두면 첫 번째 탭을 사용합니다. */
var SHEET_NAME = 'Sheet1';

/** 시간대 */
var TIMEZONE = 'Asia/Seoul';

/**
 * 새 주문이 들어왔을 때 알림 메일을 받고 싶으면 주소를 넣으세요. 예: 'dibig12@naver.com'
 * 비워 두면 메일을 보내지 않습니다. (처음 한 번 권한 승인이 필요합니다.)
 */
var NOTIFY_EMAIL = '';

/**
 * 관리자 전용 기능(주문 목록·입금확인·송장번호)을 쓸 본인 Gmail 주소.
 * 반드시 여기에 본인 Gmail을 넣으세요. 예: 'dibig788@gmail.com'
 * 비워 두면 관리자 기능은 동작하지 않습니다.
 * 보안상 GitHub 저장소에는 빈칸으로 두고, Apps Script 편집기에서만 입력하세요.
 * Google 로그인 방식을 쓰려면 웹앱 배포 설정이 '실행: 나',
 * '액세스: Google 계정이 있는 모든 사용자'여야 접속한 Gmail을 확인할 수 있습니다.
 */
var OWNER_EMAIL = '';

/**
 * 관리자 키 — 관리자 페이지(admin.html)에서 목록을 볼 때 쓰는 비밀번호입니다.
 * GitHub 저장소에는 빈칸으로 두고, Apps Script 편집기에서만 입력하세요.
 * 배포 2(관리자용)를 '액세스: 모든 사용자'로 풀어도 이 키를 아는 사람만
 * 관리자 기능을 쓸 수 있습니다. 키는 절대 GitHub에 올리지 마세요.
 */
var ADMIN_KEY = '';

/** 시트 1행 헤더 (index.html 설정과 순서가 같아야 합니다) */
var HEADERS = [
  '주문일시', '상품명', '수량', '총금액', '입금자명', '주문자',
  '주문자연락처', '받는분', '받는분연락처', '받는분주소', '요청사항', '입금확인', '송장번호'
];

/* ============================================================
 *  주문 접수 (POST)
 * ============================================================ */
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) return respond({ ok: false, error: 'no_data' });

    var data = JSON.parse(raw);

    // 관리자 업데이트 (admin.html에서 보낸 요청)
    if (data.action === 'update') return adminUpdate(data);
    if (data.action === 'updateBatch') return adminUpdateBatch(data);
    if (data.action === 'delete') return adminDelete(data);

    // 필수값 확인 (홈페이지에서도 검사하지만 마지막으로 한 번 더)
    var missing = [];
    if (!data.ordererName) missing.push('주문자');
    if (!data.ordererPhone) missing.push('주문자연락처');
    if (!data.receiverName) missing.push('받는분');
    if (!data.receiverPhone) missing.push('받는분연락처');
    if (!data.receiverAddress) missing.push('받는분주소');
    if (!data.depositor) missing.push('입금자명');
    if (!data.items || !data.items.length) missing.push('상품');
    if (missing.length) return respond({ ok: false, error: '필수값 누락: ' + missing.join(', ') });

    var sheet = getSheet();
    ensureHeader(sheet);

    var lock = LockService.getScriptLock();
    lock.waitLock(20000); // 동시에 두 주문이 들어와도 줄이 겹치지 않게
    var rowIndex;
    try {
      var now = new Date();
      var stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

      var productText = data.productSummary || (data.items || []).map(function (i) {
        return i.name + ' ' + i.qty + '박스';
      }).join(', ');

      var row = [
        stamp,
        safe(productText),
        Number(data.totalQty || 0),
        Number(data.totalAmount || 0),
        safe(data.depositor),
        safe(data.ordererName),
        safe(data.ordererPhone),
        safe(data.receiverName),
        safe(data.receiverPhone),
        safe(data.receiverAddress),
        safe(data.memo),
        '',   // 입금확인 (농원에서 직접 체크)
        ''    // 송장번호 (출고 후 입력)
      ];

      sheet.appendRow(row);
      rowIndex = sheet.getLastRow();
      // 총금액 열(D)을 천 단위 구분 형식으로
      sheet.getRange(rowIndex, 4).setNumberFormat('#,##0');
    } finally {
      lock.releaseLock();
    }

    notify(data, productText);

    return respond({ ok: true, row: rowIndex });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  상태 확인용 (브라우저로 주소를 열면 동작 여부를 보여줍니다)
 * ============================================================ */
function doGet(e) {
  // 관리자 주문 목록 조회 (admin.html에서 ?action=list 로 호출)
  if (e && e.parameter && e.parameter.action === 'list') return adminList(e.parameter.key);
  var status = 'ok';
  var message = '효돈농원 주문 접수 서비스가 동작 중입니다.';
  try {
    var sheet = getSheet();
    ensureHeader(sheet);
    message += ' 시트: ' + sheet.getParent().getName() + ' / 현재 ' + Math.max(0, sheet.getLastRow() - 1) + '건 접수.';
  } catch (err) {
    status = 'error';
    message = '시트를 열 수 없습니다: ' + err;
  }
  return respond({
    ok: status === 'ok',
    service: '효돈농원 주문 접수',
    message: message,
    time: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
  });
}

/* ============================================================
 *  관리자 전용 (admin.html)
 *  - 관리자 키(ADMIN_KEY)가 맞거나, OWNER_EMAIL과 접속한 Google 계정이 같을 때 동작합니다.
 *  - 관리자 페이지는 fetch로 부르기 때문에 Google 로그인 방식이 브라우저에서 막힐 수
 *    있어 키 방식을 씁니다. 키 방식을 쓸 때는 배포 액세스를 '모든 사용자'로 둡니다.
 * ============================================================ */
function checkAdmin(key) {
  if (key && ADMIN_KEY && String(key) === String(ADMIN_KEY)) return;
  if (!OWNER_EMAIL) throw new Error('관리자 키를 Code.gs에 입력하세요. (ADMIN_KEY 또는 OWNER_EMAIL)');
  var me = '';
  try { me = Session.getActiveUser().getEmail(); } catch (err) { me = ''; }
  if (me && me.toLowerCase() === String(OWNER_EMAIL).toLowerCase()) return;
  throw new Error('관리자 확인이 필요합니다. 관리자 키를 입력하거나 본인 Google 계정으로 로그인하세요.');
}

function adminList(key) {
  try {
    checkAdmin(key);
    var sheet = getSheet();
    ensureHeader(sheet);
    var lastRow = sheet.getLastRow();
    var orders = [];
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();
      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        if (!String(r[0] || '').trim() && !String(r[5] || '').trim()) continue;
        orders.push({
          row: i + 2,
          datetime: r[0], product: r[1], qty: Number(r[2] || 0),
          amount: Number(String(r[3] || '0').replace(/[^0-9]/g, '') || 0),
          depositor: r[4], orderer: r[5], ordererPhone: r[6],
          receiver: r[7], receiverPhone: r[8], receiverAddress: r[9],
          memo: r[10], paid: String(r[11] || '').trim() !== '',
          paidText: r[11], tracking: r[12]
        });
      }
    }
    orders.reverse(); // 최신 주문이 위로
    return respond({ ok: true, orders: orders });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function adminUpdateBatch(data) {
  try {
    checkAdmin(data && data.key);
    var updates = (data && data.updates) || [];
    if (!updates.length) return respond({ ok: false, error: '업데이트할 주문이 없습니다.' });
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      for (var i = 0; i < updates.length; i++) {
        var u = updates[i] || {};
        var row = Number(u.row || 0);
        if (!row || row < 2 || row > lastRow) continue;
        sheet.getRange(row, 12).setValue(u.paid ? '확인' : '');
        sheet.getRange(row, 13).setValue(safe(u.tracking));
      }
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, updated: updates.length });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function adminDelete(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number(data && data.row || 0);
    if (!row || row < 2) return respond({ ok: false, error: '잘못된 행 번호입니다.' });
    var sheet = getSheet();
    if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
    sheet.deleteRow(row);
    return respond({ ok: true, row: row });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function adminUpdate(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number(data.row || 0);
    if (!row || row < 2) return respond({ ok: false, error: '잘못된 행 번호입니다.' });
    var sheet = getSheet();
    if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // L열(12): 입금확인 — 체크되면 '확인'이라고 적고, 해제되면 비웁니다.
      sheet.getRange(row, 12).setValue(data.paid ? '확인' : '');
      // M열(13): 송장번호
      sheet.getRange(row, 13).setValue(safe(data.tracking));
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, row: row });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  도우미 함수
 * ============================================================ */
function getSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  if (SHEET_NAME) {
    var named = ss.getSheetByName(SHEET_NAME);
    if (named) return named;
  }
  return ss.getSheets()[0];
}

/** 1행 헤더가 비어 있으면 채웁니다 (시트를 새로 만들어도 그대로 동작) */
function ensureHeader(sheet) {
  var firstCell = sheet.getRange(1, 1).getValue();
  if (!firstCell) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

/** 스프레드시트 수식으로 해석될 수 있는 입력을 무력화합니다. */
function safe(value) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

/** 주문 알림 메일 (NOTIFY_EMAIL 이 비어 있으면 건너뜁니다) */
function notify(data, productText) {
  if (!NOTIFY_EMAIL) return;
  try {
    var body = [
      '새 주문이 접수되었습니다.',
      '',
      '상품: ' + productText,
      '수량: ' + data.totalQty + '박스',
      '금액: ' + Number(data.totalAmount || 0).toLocaleString() + '원',
      '입금자명: ' + data.depositor,
      '',
      '주문자: ' + data.ordererName + ' / ' + data.ordererPhone,
      '받는 분: ' + data.receiverName + ' / ' + data.receiverPhone,
      '주소: ' + data.receiverAddress,
      '요청사항: ' + (data.memo || '없음'),
      '',
      '시트: https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit'
    ].join('\n');
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: '[효돈농원] 새 주문 — ' + data.receiverName + ' / ' + Number(data.totalAmount || 0).toLocaleString() + '원',
      body: body
    });
  } catch (err) {
    // 메일 실패가 주문 접수를 막지 않게 합니다.
    console.error('notify failed: ' + err);
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  시트 서식 한 번에 잡기 (편집기에서 직접 실행)
 * ============================================================ */
function formatSheet() {
  var sheet = getSheet();
  ensureHeader(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#fdf0e0')
    .setFontColor('#5a3a1c');
  sheet.setColumnWidth(1, 140);   // 주문일시
  sheet.setColumnWidth(2, 240);   // 상품명
  sheet.setColumnWidth(3, 60);    // 수량
  sheet.setColumnWidth(4, 90);    // 총금액
  sheet.setColumnWidth(5, 90);    // 입금자명
  sheet.setColumnWidth(6, 90);    // 주문자
  sheet.setColumnWidth(7, 120);   // 주문자연락처
  sheet.setColumnWidth(8, 90);    // 받는분
  sheet.setColumnWidth(9, 120);   // 받는분연락처
  sheet.setColumnWidth(10, 320);  // 받는분주소
  sheet.setColumnWidth(11, 220);  // 요청사항
  sheet.setColumnWidth(12, 80);   // 입금확인
  sheet.setColumnWidth(13, 140);  // 송장번호
  sheet.getRange(2, 4, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('#,##0');
}
