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
 *   5) 홈페이지 사진 관리: 사진설정 탭 + Drive "효돈농원 홈페이지 사진" 폴더.
 *      홈페이지가 ?action=photos 로 슬롯별 URL을 읽고, 관리자가
 *      action=uploadPhoto / deletePhoto 로 사진을 바꾸거나 되돌립니다.
 *      아래 '홈페이지 사진 관리' 절을 보세요.
 *   6) 상품 관리: 상품설정 탭. 홈페이지가 ?action=products 로 노출 중인
 *      상품 목록을 읽고, 관리자가 action=upsertProduct / setProductActive 로
 *      상품을 추가·수정·노출 중단합니다. 주문이 들어오면 카탈로그 가격으로
 *      금액을 서버에서 다시 계산합니다 (탭이 비어 있으면 클라이언트 금액 유지).
 *      아래 '상품 관리' 절을 보세요.
 *   7) 새 주문 문자 알림 (SMS Gateway for Android, 클라우드 모드): 주문이 접수되면 농원 전화번호로 문자 1건.
 *      계정이 비어 있으면 건너뜁니다. 아래 '문자 알림' 절을 보세요.
 *   8) 홍보 문자 발송 (SMS Gateway for Android, 클라우드 모드): 관리자가
 *      직접 입력한 번호들로 홍보 문자를 보냅니다. 대량 발송은 즉시
 *      보내지 않고 '문자발송큐' 탭에 예약한 뒤, 15분마다 트리거가
 *      4건씩 60초 간격으로 천천히 보냅니다. 하루 최대 100건(성공
 *      건수 기준). 1건 테스트 발송만 즉시 보냅니다. 발송 기록은
 *      '문자발송기록' 탭에 남습니다. 아래 '홍보 문자 발송' 절을 보세요.
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
 * SMS Gateway for Android 계정 — 문자 발송용 안드로이드 기기의 클라우드 계정입니다.
 * GitHub 저장소에는 빈칸으로 두고, Apps Script 편집기에서만 입력하세요.
 * 계정 확인: 안드로이드 폰에 SMS Gateway for Android 앱을 설치하고
 * Cloud Server를 켠 뒤 Sign Up(이메일 불필요)하면 화면에 아이디·비밀번호가 뜹니다.
 * 계정이 비어 있으면 문자 알림은 조용히 건너뛰고 주문은 정상 접수됩니다.
 */
var SMSGATE_USERNAME = '';
var SMSGATE_PASSWORD = '';

/** 새 주문 알림 문자를 받을 농원 전화번호 (편집기에서 바꾸면 됩니다). */
var NOTIFY_PHONE = '010-2604-7402';

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

    // 홈페이지 사진 관리 (admin.html 사진 관리에서 보낸 요청)
    // body의 key는 관리자 키(기존 checkAdmin과 같은 규칙)이고,
    // 사진 슬롯은 slot 필드로 받습니다. (key를 슬롯으로 쓰면 키 확인과 겹칩니다)
    if (data.action === 'uploadPhoto') return uploadPhoto(data);
    if (data.action === 'deletePhoto') return deletePhoto(data);

    // 새 주문 문자 알림 테스트 (admin.html에서 호출, 계정 확인은 testSmsGate 안에서)
    if (data.action === 'testSmsGate') return testSmsGate(data);

    // 홍보 문자 예약·테스트·현황·트리거 (admin.html 홍보 문자에서 호출, 배포 2 관리자 전용)
    if (data.action === 'reservePromo') return reservePromo(data);
    if (data.action === 'sendPromoTest') return sendPromoTest(data);
    if (data.action === 'getPromoStatus') return getPromoStatus(data);
    if (data.action === 'setupPromoTrigger') return setupPromoTrigger(data);

    // 상품 관리 (admin.html 상품 관리에서 보낸 요청)
    if (data.action === 'upsertProduct') return upsertProduct(data);
    if (data.action === 'setProductActive') return setProductActive(data);

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

    // 상품 가격을 서버에서 다시 계산합니다 (상품설정 탭이 있을 때만).
    // 탭에 없는 상품이 섞여 있으면 클라이언트가 보낸 금액을 그대로 씁니다.
    // 다시 계산했으면 내역도 카탈로그 이름·가격으로 바꿔 응답에 담습니다.
    var repricedItems = repriceOrder_(data);

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
    notifyNewOrder_(data, productText);

    return respond({
      ok: true,
      row: rowIndex,
      totalAmount: Number(data.totalAmount || 0),
      items: repricedItems || data.items
    });
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
  // 손님용 배송 조회 (track.html에서 ?action=track&phone=... 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'track') return trackGet(e.parameter.phone);
  // 홈페이지 사진 설정 조회 (index.html에서 ?action=photos 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'photos') return photosGet();
  // 상품 목록 조회 (index.html에서 ?action=products 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'products') return productsGet();
  // 상품 전체 목록 조회 (admin.html 상품 관리에서 호출, 키 확인)
  if (e && e.parameter && e.parameter.action === 'productsAll') return productsAll(e.parameter.key);
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

// 손님용 조회: 전화번호(주문자 또는 받는분)가 일치하는 주문만,
// 이름·연락처·주소를 제외한 최소 정보만 돌려준다.
function trackGet(phone) {
  try {
    var digits = String(phone || '').replace(/[^0-9]/g, '');
    if (digits.length < 10 || digits.length > 11) return respond({ ok: false, error: '전화번호를 정확히 입력하세요.' });
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond({ ok: true, orders: [] });
    var values = sheet.getRange(2, 1, lastRow - 1, 13).getDisplayValues();
    var out = [];
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var ordPhone = String(r[6] || '').replace(/[^0-9]/g, '');
      var recvPhone = String(r[8] || '').replace(/[^0-9]/g, '');
      if (ordPhone !== digits && recvPhone !== digits) continue;
      out.push({
        datetime: r[0], product: r[1], qty: Number(r[2] || 0), amount: Number(String(r[3] || '0').replace(/[^0-9]/g, '') || 0),
        receiver: r[7], paid: r[11] === '확인', tracking: r[12] || ''
      });
      if (out.length >= 20) break;
    }
    out.sort(function (a, b) { return String(b.datetime).localeCompare(String(a.datetime)); });
    return respond({ ok: true, orders: out });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
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
        // M열(13): 송장번호 — 앞자리 0이 사라지지 않게 텍스트 형식으로 저장
        sheet.getRange(row, 13).setNumberFormat('@').setValue(safe(u.tracking));
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
      // M열(13): 송장번호 — 앞자리 0이 사라지지 않게 텍스트 형식으로 저장
      sheet.getRange(row, 13).setNumberFormat('@').setValue(safe(data.tracking));
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, row: row });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  홈페이지 사진 관리 (사진설정 탭 + Google Drive)
 *  - 관리자가 admin.html '사진 관리'에서 사진을 올리면, Drive
 *    "효돈농원 홈페이지 사진" 폴더에 저장하고 "링크가 있는 모든
 *    사용자"가 볼 수 있게 공유한 뒤, 사진설정 탭에 슬롯별 URL을
 *    저장합니다. 홈페이지(index.html)는 배포 1 ?action=photos 로
 *    읽어 URL이 있는 슬롯의 사진만 교체합니다.
 *  - 사진 업로드·삭제는 관리자 전용(checkAdmin)입니다.
 *    body의 key는 관리자 키, slot이 사진 슬롯입니다.
 *  - 행만 지우면 기본 번들 이미지로 돌아갑니다. Drive 파일은
 *    폴더에 그대로 남으니, 필요하면 Drive에서 직접 지우세요.
 * ============================================================ */
/** 사진설정 탭 이름 (열: key, driveFileId, url, updatedAt) */
var PHOTOS_SHEET_NAME = '사진설정';
var PHOTOS_HEADERS = ['key', 'driveFileId', 'url', 'updatedAt'];
/** 사진을 모아둘 Drive 폴더 이름 */
var PHOTO_FOLDER_NAME = '효돈농원 홈페이지 사진';
/** 파일 크기 상한 (브라우저 축소 후 기준) */
var PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** 사진 슬롯 키 — hero, 상품 4종, 농장 갤러리 6장.
 *  isValidPhotoSlotKey가 이 목록에 있는 키를 받습니다.
 *  (상품 id는 상품설정 탭에 있을 때만 받고, 이 목록에는 안 넣습니다.) */
var PHOTO_KEYS = ['hero', 'product-home', 'product-gift', 'product-mixed', 'product-golden-gift', 'gallery-1', 'gallery-2', 'gallery-3', 'gallery-4', 'gallery-5', 'gallery-6'];

/** 사진설정 탭을 가져옵니다. 없으면 헤더와 함께 만듭니다. */
function getPhotosSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PHOTOS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PHOTOS_SHEET_NAME);
    sheet.getRange(1, 1, 1, PHOTOS_HEADERS.length).setValues([PHOTOS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 슬롯별 사진 URL (공개 읽기, 키 없음) — 탭이 없어도 빈 객체를 돌려줍니다. */
function photosGet() {
  try {
    var photos = {};
    var sheet = getPhotosSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      for (var i = 0; i < values.length; i++) {
        var key = String(values[i][0] || '').trim();
        var url = String(values[i][2] || '').trim();
        if (key && url) photos[key] = url;
      }
    }
    return respond({ ok: true, photos: photos });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** Drive "효돈농원 홈페이지 사진" 폴더를 찾거나 만듭니다. */
function getPhotoFolder() {
  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

/** 사진설정 탭에 슬롯 한 줄을 새로 넣거나 갈아 끼웁니다. */
function upsertPhoto(slot, fileId, url) {
  var sheet = getPhotosSheet();
  var lastRow = sheet.getLastRow();
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === slot) {
        sheet.getRange(i + 2, 2, 1, 3).setValues([[fileId, url, stamp]]);
        return;
      }
    }
  }
  sheet.appendRow([slot, fileId, url, stamp]);
}

/** 사진설정 탭에서 해당 키의 행을 지웁니다. 없으면 아무것도 하지 않습니다. */
function deletePhotoRowIn_(sheet, key) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var keys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0] || '').trim() === key) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}

/**
 * 사진 업로드 (관리자 전용)
 * body: { action: 'uploadPhoto', key: 관리자 키, slot: 사진 슬롯,
 *         filename, mimeType, base64 }
 * base64는 브라우저에서 1600px·JPEG 0.85로 줄인 뒤 보낸 값입니다.
 * 5MB(축소 후 기준)를 넘으면 에러를 돌려줍니다.
 */
function uploadPhoto(data) {
  try {
    checkAdmin(data && data.key);
    var slot = String((data && data.slot) || '').trim();
    if (!isValidPhotoSlotKey(slot)) {
      return respond({ ok: false, error: '알 수 없는 사진 슬롯입니다: ' + slot });
    }
    var b64 = String((data && data.base64) || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!b64) return respond({ ok: false, error: '이미지 데이터가 없습니다.' });
    var bytes = Utilities.base64Decode(b64);
    if (bytes.length > PHOTO_MAX_BYTES) {
      return respond({ ok: false, error: '파일이 너무 큽니다. 5MB 이하로 줄여 다시 올려주세요.' });
    }
    var mimeType = String((data && data.mimeType) || 'image/jpeg');
    if (mimeType.indexOf('image/') !== 0) {
      return respond({ ok: false, error: '이미지 파일만 올릴 수 있습니다.' });
    }
    var filename = String((data && data.filename) || (slot + '.jpg')).replace(/[\\/:*?"<>|]/g, '_');
    if (!filename) filename = slot + '.jpg';
    var blob = Utilities.newBlob(bytes, mimeType, filename);
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var fileId, url;
    try {
      var folder = getPhotoFolder();
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileId = file.getId();
      url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200';
      upsertPhoto(slot, fileId, url);
      // 상품 id로 사진을 올리면, 같은 상품의 옛 슬롯 행(product-home 등)이
      // 남아 있을 수 있으니 지웁니다. 홈페이지가 새 키를 먼저 보기 때문에
      // 옛 행은 더 이상 쓰이지 않습니다.
      var legacyUp = LEGACY_PHOTO_KEYS[slot];
      if (legacyUp) deletePhotoRowIn_(getPhotosSheet(), legacyUp);
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, slot: slot, url: url, fileId: fileId });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 사진 삭제 (관리자 전용) — 사진설정 탭에서 해당 슬롯 행을 지워
 * 기본 번들 이미지로 되돌립니다. Drive 파일은 폴더에 남습니다.
 * body: { action: 'deletePhoto', key: 관리자 키, slot: 사진 슬롯 }
 */
function deletePhoto(data) {
  try {
    checkAdmin(data && data.key);
    var slot = String((data && data.slot) || '').trim();
    if (!isValidPhotoSlotKey(slot)) {
      return respond({ ok: false, error: '알 수 없는 사진 슬롯입니다: ' + slot });
    }
    var sheet = getPhotosSheet();
    deletePhotoRowIn_(sheet, slot);
    // 상품 id로 되돌리면 같은 상품의 옛 슬롯 행도 함께 지웁니다.
    var legacyDel = LEGACY_PHOTO_KEYS[slot];
    if (legacyDel) deletePhotoRowIn_(sheet, legacyDel);
    return respond({ ok: true, slot: slot });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  상품 관리 (상품설정 탭)
 *  - 관리자가 admin.html '상품 관리'에서 상품을 추가·수정·노출 중단하면
 *    상품설정 탭에 저장합니다. 홈페이지(index.html)는 배포 1
 *    ?action=products 로 노출 중인 상품만 읽어 상품 그리드를 그립니다.
 *  - 탭이 비어 있으면 홈페이지는 하드코드된 기본 4종을 그대로 씁니다.
 *    그래서 관리자가 처음 상품을 고칠 때, 빈 탭에 기본 4종을 먼저
 *    심어 둡니다 (ensureCatalogSeeded_). 기본 4종이 탭에 들어간 뒤에는
 *    탭이 기준이 됩니다. 기본 4종 내용은 React의 config.ts와 같습니다.
 *  - 주문이 들어오면 카탈로그 가격 × 수량으로 금액을 서버에서 다시
 *    계산합니다 (repriceOrder_). 탭이 비어 있거나 탭에 없는 상품이
 *    섞여 있으면 클라이언트가 보낸 금액을 그대로 씁니다.
 *  - 상품 추가·수정·노출 변경은 관리자 전용(checkAdmin)입니다.
 *  - 사진 슬롯 키는 상품 id 기준입니다 ('hero' 제외). 옛 슬롯 키
 *    (product-home 등)는 홈페이지가 읽을 때만 폴백으로 봅니다.
 *    상품 id의 유효성은 isValidPhotoSlotKey가 함께 확인합니다.
 * ============================================================ */
/** 상품설정 탭 이름 (열: id, name, price, unit, imageKey, active, sortOrder, description) */
var PRODUCTS_SHEET_NAME = '상품설정';
var PRODUCTS_HEADERS = ['id', 'name', 'price', 'unit', 'imageKey', 'active', 'sortOrder', 'description'];
/** 기본 4종 id — 상품설정 탭이 비어 있을 때의 폴백 (config.ts와 같은 값) */
var FALLBACK_PRODUCT_IDS = ['mandarin-home', 'mandarin-gift', 'golden-mix', 'golden-gift'];
/** 기본 4종 내용 (탭이 비어 있을 때 처음 수정하는 경우 탭에 심어 둡니다) */
var FALLBACK_PRODUCTS = [
  { id: 'mandarin-home', name: '노지감귤 가정용 10kg', price: 21000, unit: '10kg', description: '10kg 한 상자. 크기와 모양이 조금씩 다릅니다. 가정에서 먹기 좋은 노지감귤입니다.' },
  { id: 'mandarin-gift', name: '노지감귤 선물용 10kg', price: 38000, unit: '10kg', description: '10kg 한 상자. 크기가 고른 것만 골라 담았습니다. 선물용 박스 포장입니다.' },
  { id: 'golden-mix', name: '황금향 혼합 5kg', price: 25000, unit: '5kg', description: '크고 작은 황금향을 함께 담았습니다. 껍질이 얇고 과즙이 많은 황금향을 집에서 편하게.' },
  { id: 'golden-gift', name: '황금향 선물용 5kg', price: 30000, unit: '5kg', description: '선물하기 좋은 황금향만 골라 담은 5kg. 향과 단맛이 진한 제주 황금향입니다.' }
];
/** 옛 사진 슬롯 키 (상품 id → 옛 키). 사진 읽을 때만 폴백으로 봅니다. */
var LEGACY_PHOTO_KEYS = {
  'mandarin-home': 'product-home',
  'mandarin-gift': 'product-gift',
  'golden-mix': 'product-mixed',
  'golden-gift': 'product-golden-gift'
};

/** 상품설정 탭을 가져옵니다. 없으면 헤더와 함께 만듭니다. */
function getProductsSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PRODUCTS_SHEET_NAME);
    sheet.getRange(1, 1, 1, PRODUCTS_HEADERS.length).setValues([PRODUCTS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 상품설정 탭의 모든 행을 읽어 상품 배열로 돌려줍니다 (노출 중단 포함). */
function readProducts_() {
  var sheet = getProductsSheet();
  var lastRow = sheet.getLastRow();
  var out = [];
  if (lastRow < 2) return out;
  var values = sheet.getRange(2, 1, lastRow - 1, PRODUCTS_HEADERS.length).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var id = String(r[0] || '').trim();
    if (!id) continue;
    var activeRaw = String(r[5] == null ? '' : r[5]).trim().toLowerCase();
    out.push({
      id: id,
      name: String(r[1] || '').trim(),
      price: Number(String(r[2] || '0').replace(/[^0-9]/g, '') || 0),
      unit: String(r[3] || '').trim(),
      imageKey: String(r[4] || '').trim() || id,
      active: activeRaw === '' || activeRaw === 'true',
      sortOrder: Number(String(r[6] || '0').replace(/[^0-9]/g, '') || 0),
      description: String(r[7] || '')
    });
  }
  return out;
}

/** 상품설정 탭의 id만 읽습니다 (탭이 없으면 만들지 않습니다). */
function getCatalogIds_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  var ids = [];
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    if (id) ids.push(id);
  }
  return ids;
}

/** 상품설정 탭을 sortOrder 순으로 정렬합니다 (번호가 같으면 시트 순서). */
function sortProducts_(rows) {
  return rows.slice().sort(function (a, b) {
    var d = (a.sortOrder || 0) - (b.sortOrder || 0);
    return d !== 0 ? d : 0;
  });
}

/**
 * 사진 슬롯 키가 유효한지 확인합니다.
 * 'hero'와 옛 슬롯 키(product-home 등)는 그대로 받고, 상품 id는
 * 상품설정 탭에 있을 때만 받습니다. 탭이 비어 있으면 기본 4종 id만 받습니다.
 * 상품이 추가되면 그 상품 id로 사진을 올릴 수 있게 됩니다.
 */
function isValidPhotoSlotKey(slot) {
  if (slot === 'hero') return true;
  if (PHOTO_KEYS.indexOf(slot) >= 0) return true;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slot) || slot.length > 64) return false;
  var ids = getCatalogIds_();
  if (ids.length) return ids.indexOf(slot) >= 0;
  return FALLBACK_PRODUCT_IDS.indexOf(slot) >= 0;
}

/** 노출 중인 상품 목록 (공개 읽기, 키 없음) — 탭이 비어 있으면 빈 배열입니다. */
function productsGet() {
  try {
    var rows = sortProducts_(readProducts_());
    var products = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].active) products.push(rows[i]);
    }
    return respond({ ok: true, products: products });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 상품 전체 목록 (관리자 전용) — 노출 중단된 상품도 포함합니다. */
function productsAll(key) {
  try {
    checkAdmin(key);
    var rows = sortProducts_(readProducts_());
    return respond({ ok: true, products: rows });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 상품설정 탭이 비어 있으면 기본 4종을 먼저 심어 둡니다. */
function ensureCatalogSeeded_() {
  var sheet = getProductsSheet();
  if (sheet.getLastRow() >= 2) return;
  for (var i = 0; i < FALLBACK_PRODUCTS.length; i++) {
    var p = FALLBACK_PRODUCTS[i];
    sheet.appendRow([p.id, p.name, p.price, p.unit, p.id, true, i + 1, p.description]);
  }
  sheet.getRange(2, 3, FALLBACK_PRODUCTS.length, 1).setNumberFormat('#,##0');
}

/**
 * 상품 추가·수정 (관리자 전용)
 * body: { action: 'upsertProduct', key: 관리자 키, id?: 상품 id (없으면 새로 만듦),
 *         name, price, unit, description }
 * price는 0보다 큰 정수만 허용합니다 (1원 ~ 1,000만원).
 * id가 없으면 'product-<timestamp>'로 만들고, imageKey는 id와 같게 합니다.
 * 이미지 키는 사진 슬롯 키와 같습니다 (상품 id 기준).
 */
function upsertProduct(data) {
  try {
    checkAdmin(data && data.key);
    var name = String((data && data.name) || '').trim();
    if (!name) return respond({ ok: false, error: '상품 이름을 입력하세요.' });
    if (name.length > 100) return respond({ ok: false, error: '상품 이름이 너무 깁니다.' });
    var price = Number(String(data && data.price != null ? data.price : '').replace(/[^0-9]/g, '') || 0);
    if (!price || price <= 0 || price > 10000000) {
      return respond({ ok: false, error: '가격은 1원 이상 1,000만원 이하의 숫자여야 합니다.' });
    }
    var unit = String((data && data.unit) || '').trim();
    if (!unit) return respond({ ok: false, error: '단위를 입력하세요. (예: 10kg)' });
    if (unit.length > 30) return respond({ ok: false, error: '단위가 너무 깁니다.' });
    var description = String((data && data.description) || '').slice(0, 500);
    var id = String((data && data.id) || '').trim();
    if (id && !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      return respond({ ok: false, error: '상품 id 형식이 올바르지 않습니다.' });
    }
    var sheet = getProductsSheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      ensureCatalogSeeded_();
      var lastRow = sheet.getLastRow();
      var targetRow = 0;
      var maxOrder = 0;
      if (lastRow >= 2) {
        var values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
        for (var i = 0; i < values.length; i++) {
          var rowId = String(values[i][0] || '').trim();
          var ord = Number(String(values[i][6] || '0').replace(/[^0-9]/g, '') || 0);
          if (ord > maxOrder) maxOrder = ord;
          if (id && rowId === id) targetRow = i + 2;
        }
      }
      if (targetRow) {
        // 기존 상품 수정 — 노출 여부·순서·이미지 키는 그대로 둡니다.
        sheet.getRange(targetRow, 2, 1, 3).setValues([[safe(name), price, safe(unit)]]);
        sheet.getRange(targetRow, 8).setValue(safe(description));
        sheet.getRange(targetRow, 3).setNumberFormat('#,##0');
        var after = readProducts_();
        for (var j = 0; j < after.length; j++) {
          if (after[j].id === id) return respond({ ok: true, product: after[j] });
        }
        return respond({ ok: false, error: '저장은 됐지만 상품을 다시 읽지 못했습니다.' });
      }
      if (!id) id = 'product-' + new Date().getTime();
      var imageKey = String((data && data.imageKey) || '').trim() || id;
      sheet.appendRow([id, safe(name), price, safe(unit), safe(imageKey), true, maxOrder + 1, safe(description)]);
      sheet.getRange(sheet.getLastRow(), 3).setNumberFormat('#,##0');
      var created = readProducts_();
      for (var k = 0; k < created.length; k++) {
        if (created[k].id === id) return respond({ ok: true, product: created[k] });
      }
      return respond({ ok: false, error: '저장은 됐지만 상품을 다시 읽지 못했습니다.' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 상품 노출·중단 (관리자 전용) — "삭제"는 노출 중단으로 처리합니다.
 * 완전 삭제는 하지 않습니다. 기존 주문 내역과 무관하게 안전합니다.
 * body: { action: 'setProductActive', key: 관리자 키, id, active }
 */
function setProductActive(data) {
  try {
    checkAdmin(data && data.key);
    var id = String((data && data.id) || '').trim();
    if (!id) return respond({ ok: false, error: '상품 id가 없습니다.' });
    var active = !!data.active;
    var sheet = getProductsSheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      ensureCatalogSeeded_();
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
        for (var i = 0; i < values.length; i++) {
          if (String(values[i][0] || '').trim() === id) {
            sheet.getRange(i + 2, 6).setValue(active);
            return respond({ ok: true, id: id, active: active });
          }
        }
      }
      return respond({ ok: false, error: '없는 상품입니다: ' + id });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 주문 금액을 카탈로그 가격으로 다시 계산합니다.
 * 상품설정 탭이 비어 있으면 false를 돌려줘 클라이언트 금액을 유지합니다.
 * 탭에 없는 상품이 하나라도 섞여 있으면 전체를 클라이언트 금액으로 둡니다
 * (일부만 다시 계산하면 내역과 합계가 어긋나기 때문입니다).
 * 성공하면 data.totalAmount와 data.productSummary를 갱신하고,
 * 카탈로그 기준 내역을 배열로 돌려줍니다.
 */
function repriceOrder_(data) {
  var rows = readProducts_();
  if (!rows.length) return null;
  var byId = {};
  for (var i = 0; i < rows.length; i++) byId[rows[i].id] = rows[i];
  var items = data.items || [];
  var total = 0;
  var repriced = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j] || {};
    var catalog = byId[it.id];
    if (!catalog) return null;
    var qty = Number(it.qty || 0);
    var amount = catalog.price * qty;
    total += amount;
    repriced.push({ id: it.id, name: catalog.name, qty: qty, price: catalog.price, amount: amount });
  }
  data.totalAmount = total;
  data.productSummary = repriced.map(function (r) {
    return r.name + ' ' + r.qty + '박스';
  }).join(', ');
  return repriced;
}

/* ============================================================
 *  문자 알림 (SMS Gateway for Android, 클라우드 모드) — 새 주문 시 농원에 문자 1건
 * ============================================================ */

/** 수신자 번호를 E.164 형식으로 바꿉니다 (01012345678 -> +821012345678). */
function formatPhoneE164_(phone) {
  var digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.indexOf('82') === 0 && digits.length > 10) return '+' + digits;
  if (digits.charAt(0) === '0') return '+82' + digits.substring(1);
  return '+82' + digits;
}

/** SMS Gateway 클라우드 서버로 문자 1건을 보냅니다. 성공하면 true, 실패하면 false를 반환합니다. */
function sendSmsViaSmsGate_(phone, message) {
  if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) return false;
  var to = formatPhoneE164_(phone);
  if (!to || !message) return false;
  try {
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Basic ' + Utilities.base64Encode(SMSGATE_USERNAME + ':' + SMSGATE_PASSWORD)
      },
      payload: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [to] }),
      muteHttpExceptions: true
    };
    var res = UrlFetchApp.fetch('https://api.sms-gate.app/3rdparty/v1/message', options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    Logger.log('SMS Gateway send failed: HTTP ' + code + ' ' + res.getContentText());
    return false;
  } catch (err) {
    Logger.log('SMS Gateway send error: ' + err);
    return false;
  }
}

/**
 * 새 주문이 들어오면 농원에 문자 1건을 보냅니다.
 * 메시지 예시:
 *   [효돈농원] 새 주문: 노지감귤 가정용 10kg 1박스 21,000원,
 *   테스트E 010-7777-9999 (입금자명: 테스트E)
 * 실패해도 주문 접수는 절대 막지 않습니다 (내부 try/catch + 계정 없음 시 skip).
 * 보낸 결과는 '문자발송기록' 탭에 구분 '주문알림'으로 남겨 관리자 페이지의
 * 문자 전송 모니터링에 표시합니다. 구분이 '주문알림'이라 홍보 하루 한도
 * (100건) 계산(countTodaySent_은 '홍보'만 합산)에는 들어가지 않습니다.
 */
function notifyNewOrder_(data, productText) {
  try {
    if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) return;
    var amount = Number(data.totalAmount || 0).toLocaleString();
    var message = '[효돈농원] 새 주문: ' + productText + ' ' + amount + '원, ' +
      data.ordererName + ' ' + data.ordererPhone +
      ' (입금자명: ' + data.depositor + ')';
    var ok = false;
    try { ok = sendSmsViaSmsGate_(NOTIFY_PHONE, message); } catch (e) { ok = false; }
    // 주문 알림도 '문자발송기록' 탭에 남깁니다 (구분 '주문알림').
    // 기록 쓰기가 실패해도 주문 접수와 문자 발송 결과에는 영향이 없습니다.
    try {
      var logSheet = getSmsLogSheet_();
      logPromoSend_(logSheet, '주문알림', message, 1, ok ? 1 : 0, ok ? 0 : 1, ok ? [] : [NOTIFY_PHONE]);
    } catch (logErr) {
      Logger.log('notifyNewOrder_ log failed: ' + logErr);
    }
  } catch (err) {
    // 문자 실패가 주문 접수를 막지 않게 합니다.
    Logger.log('notifyNewOrder_ failed: ' + err);
  }
}

/**
 * 관리자 테스트용 (POST action=testSmsGate, 배포 2, checkAdmin 필수).
 * "[효돈농원] 문자 알림 테스트입니다."를 NOTIFY_PHONE으로 보냅니다.
 * 계정이 비어 있으면 에러를 반환합니다.
 */
function testSmsGate(data) {
  checkAdmin(data && data.key);
  if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) {
    return respond({ ok: false, error: 'SMS Gateway 계정을 먼저 입력하세요. (Code.gs의 SMSGATE_USERNAME·SMSGATE_PASSWORD)' });
  }
  try {
    var ok = sendSmsViaSmsGate_(NOTIFY_PHONE, '[효돈농원] 문자 알림 테스트입니다.');
    if (ok) return respond({ ok: true });
    return respond({ ok: false, error: '문자 발송에 실패했습니다. SMS Gateway 앱이 켜져 있고 Cloud Server에 연결됐는지 확인하세요.' });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  홍보 문자 발송 (SMS Gateway for Android, 클라우드 모드)
 *  - 대량 발송은 즉시 보내지 않습니다. 관리자가 예약하면 '문자발송큐'
 *    탭에 상태 '대기'로 한 행씩 저장하고, 15분마다 실행되는 시간
 *    트리거(processPromoQueue_)가 4건씩 60초 간격으로 천천히 보냅니다.
 *    4건이면 약 250초라 6분 실행 제한 안에 듭니다.
 *  - 하루 상한 100건(성공 건수 기준)은 '문자발송기록' 탭에서 오늘(KST)
 *    성공 합산으로 계산하고, 남은 한도까지만 보냅니다.
 *  - 즉시 발송은 1건 테스트 발송(sendPromoTest)만 합니다.
 *    홍보 문자 대량 즉시 발송 액션(sendPromo)은 만들지 않았습니다.
 *  - 트리거 설치: setupPromoTrigger_()가 없으면 만듭니다. 권한 문제로
 *    안 되면 편집기에서 직접 설치하세요 (트리거 → 트리거 추가 →
 *    processPromoQueue_ → 시간 기반 → 15분마다).
 *  - 발송 기록은 '문자발송기록' 탭에 남습니다. 테스트 발송도 기록에
 *    남고 하루 한도에 포함됩니다.
 *  - 주문 알림(notifyNewOrder_)도 구분 '주문알림'으로 기록에 남아
 *    관리자 페이지 문자 전송 모니터링에 함께 표시됩니다. 주문 알림은
 *    홍보 하루 한도 계산에 들어가지 않습니다 (countTodaySent_은
 *    '홍보'만 합산합니다).
 * ============================================================ */
/** 홍보 문자 하루 발송 상한 (성공 건수 기준, '문자발송기록' 탭 합산). */
var PROMO_DAILY_LIMIT = 100;
/** 한 번에 예약할 수 있는 최대 건수 (큐에 넣는 건수). */
var PROMO_QUEUE_MAX = 500;
/** 큐 처리기 1회 실행 때 보내는 최대 건수. */
var PROMO_BATCH_SIZE = 4;
/** 큐 처리기 건 사이 대기 시간 (ms, 60초). */
var PROMO_QUEUE_SEND_DELAY_MS = 60000;
/** 홍보 문자 앞·뒤 문구 */
var PROMO_PREFIX = '[효돈농원] ';
var PROMO_OPT_OUT = '수신거부는 답장으로 알려주세요.';
/** 문자발송큐 탭 (열: 예약일시, 번호, 메시지, 상태, 처리시작, 발송일시, 오류) */
var SMS_QUEUE_SHEET_NAME = '문자발송큐';
var SMS_QUEUE_HEADERS = ['예약일시', '번호', '메시지', '상태', '처리시작', '발송일시', '오류'];
/** 문자발송기록 탭 (열: 날짜, 구분, 메시지, 대상수, 성공, 실패, 실패번호) */
var SMS_LOG_SHEET_NAME = '문자발송기록';
var SMS_LOG_HEADERS = ['날짜', '구분', '메시지', '대상수', '성공', '실패', '실패번호'];

/** 비밀번호 확인 전 입력 확인에서 '오늘' 날짜(KST yyyy-MM-dd)를 구합니다. */
function todayKst_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

/** 홍보 문자 최종 문장: 앞에 [효돈농원]이 없으면 붙이고, 뒤에 수신거부 안내를 새 줄에 붙입니다. 순수 함수입니다. */
function buildPromoMessage_(message) {
  var text = String(message || '').trim();
  if (text.indexOf('[효돈농원]') !== 0) text = PROMO_PREFIX + text;
  if (text.indexOf(PROMO_OPT_OUT) < 0) text = text + '\n' + PROMO_OPT_OUT;
  return text;
}

/** 번호에서 숫자만 남기고, +82(82...)로 시작하면 국내 형식(0...)으로 바꿉니다. 순수 함수입니다. */
function normalizeMobileDigits_(raw) {
  var d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.indexOf('82') === 0 && d.length >= 11 && d.length <= 13) {
    var rest = d.substring(2);
    if (/^(10|11|16|17|18|19)/.test(rest)) return '0' + rest;
  }
  return d;
}

/** 한국 휴대폰 번호인지 확인합니다 (010/011/016/017/018/019, 10~11자리). 순수 함수입니다. */
function isValidMobileDigits_(digits) {
  var d = String(digits || '');
  if (d.length !== 10 && d.length !== 11) return false;
  return /^(010|011|016|017|018|019)/.test(d);
}

/**
 * 홍보 문자용 번호를 파싱합니다.
 * 배열 또는 '한 줄에 하나 또는 쉼표 구분' 텍스트를 받아, 숫자만 남기고
 * E.164로 변환·중복 제거하고, 한국 휴대폰만 유효한 것만 남깁니다.
 * 순수 함수입니다 (Apps Script 서비스에 의존하지 않습니다).
 */
function parsePromoNumbers_(input) {
  var raw = [];
  if (Array.isArray(input)) {
    raw = input;
  } else if (typeof input === 'string') {
    raw = input.split(/[\n,;]+/);
  }
  var seen = {};
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var digits = normalizeMobileDigits_(raw[i]);
    if (!isValidMobileDigits_(digits)) continue;
    var e164 = formatPhoneE164_(digits);
    if (!e164 || seen[e164]) continue;
    seen[e164] = true;
    out.push(e164);
  }
  return out;
}

/** E.164 번호(+8210...)를 국내 형식(010...)으로 바꿉니다. 표시·기록용입니다. 순수 함수입니다. */
function e164ToDomestic_(e164) {
  var digits = String(e164 || '').replace(/[^0-9]/g, '');
  if (digits.indexOf('82') === 0 && digits.length > 10) return '0' + digits.substring(2);
  return digits;
}

/** 대기 건수와 하루 상한으로 끝나는 데 걸리는 일수를 계산합니다 (올림). 순수 함수입니다. */
function estimatePromoDays_(pending, dailyLimit) {
  if (!pending || pending <= 0) return 0;
  if (!dailyLimit || dailyLimit <= 0) return 0;
  return Math.ceil(pending / dailyLimit);
}

/** '문자발송기록' 행들에서 오늘(KST yyyy-MM-dd) '홍보' 발송 성공 건수를 합산합니다. 순수 함수입니다. */
function countTodaySent_(rows, today) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || [];
    if (String(r[0] || '').substring(0, 10) === today && String(r[1] || '') === '홍보') {
      n += Number(r[4] || 0);
    }
  }
  return n;
}

/** 큐 행들에서 해당 상태인 건수를 셉니다 (상태는 4번째 열). 순수 함수입니다. */
function countQueueStatus_(rows, status) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String((rows[i] || [])[3] || '') === status) n++;
  }
  return n;
}

/**
 * 큐 배치 1회분을 1건씩 순차 발송합니다.
 * sendFn(phone, message)는 성공 시 true, 실패 시 false를 반환합니다.
 * 건마다 sleepFn(대기 시간)을 부릅니다 (마지막 건 뒤에도 쉽니다).
 * 순수 함수입니다 (sendFn/sleepFn을 주입받습니다).
 * 반환: [{phone, message, ok, error}] (보낸 순서 그대로)
 */
function sendPromoBatch_(batch, sendFn, sleepFn) {
  var results = [];
  for (var i = 0; i < batch.length; i++) {
    var item = batch[i] || {};
    var ok = false;
    var errText = '';
    try {
      ok = !!sendFn(item.phone, item.message);
      if (!ok) errText = '발송 실패';
    } catch (e) {
      ok = false;
      errText = String(e);
    }
    results.push({ phone: item.phone, message: item.message, ok: ok, error: errText });
    if (sleepFn) sleepFn(PROMO_QUEUE_SEND_DELAY_MS);
  }
  return results;
}

/** '문자발송큐' 탭을 가져옵니다. 없으면 헤더와 함께 만듭니다. */
function getPromoQueueSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SMS_QUEUE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SMS_QUEUE_SHEET_NAME);
    sheet.getRange(1, 1, 1, SMS_QUEUE_HEADERS.length).setValues([SMS_QUEUE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** '문자발송기록' 탭을 가져옵니다. 없으면 헤더와 함께 만듭니다. */
function getSmsLogSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SMS_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SMS_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, SMS_LOG_HEADERS.length).setValues([SMS_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** '문자발송기록' 탭에 발송 기록 1행을 남깁니다. */
function logPromoSend_(sheet, kind, message, total, sent, failed, failedNumbers) {
  sheet.appendRow([
    Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    kind, message, total, sent, failed, (failedNumbers || []).join(', ')
  ]);
}

/** 오늘(KST) '홍보' 발송 성공 건수를 '문자발송기록' 탭에서 읽습니다. */
function readTodaySent_(logSheet, today) {
  var lastRow = logSheet.getLastRow();
  if (lastRow < 2) return 0;
  var rows = logSheet.getRange(2, 1, lastRow - 1, SMS_LOG_HEADERS.length).getDisplayValues();
  return countTodaySent_(rows, today);
}

/**
 * 홍보 문자 예약 (관리자 전용, 배포 2)
 * body: { action: 'reservePromo', key: 관리자 키,
 *         message: 문자 내용, numbers?: [번호...], numbersText?: '한 줄에 하나 또는 쉼표 구분' }
 * 번호는 검증(중복 제거, 한국 휴대폰) 뒤 최대 500건까지 '문자발송큐' 탭에
 * 상태 '대기'로 한 행씩 저장합니다. 즉시 발송하지 않습니다.
 * 반환: {ok, queued, message(최종 문자), estimatedDays, pending(예약 뒤 총 대기 건수)}
 */
function reservePromo(data) {
  try {
    checkAdmin(data && data.key);
    var message = String((data && data.message) || '').trim();
    if (!message) return respond({ ok: false, error: '보낼 문자를 입력하세요.' });
    if (message.length > 2000) return respond({ ok: false, error: '문자는 2000자까지 보낼 수 있습니다.' });
    var numbers = parsePromoNumbers_((data && data.numbers) || (data && data.numbersText) || '');
    if (!numbers.length) {
      return respond({ ok: false, error: '유효한 휴대폰 번호가 없습니다. 010으로 시작하는 번호를 한 줄에 하나씩 입력하세요.' });
    }
    if (numbers.length > PROMO_QUEUE_MAX) {
      return respond({ ok: false, error: '한 번에 예약할 수 있는 건수는 최대 ' + PROMO_QUEUE_MAX + '건입니다. (' + numbers.length + '건 입력됨)' });
    }
    var finalMessage = buildPromoMessage_(message);
    var sheet = getPromoQueueSheet_();
    var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var rowsToAdd = [];
    for (var i = 0; i < numbers.length; i++) {
      rowsToAdd.push([stamp, e164ToDomestic_(numbers[i]), finalMessage, '대기', '', '', '']);
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var pendingAfter = numbers.length;
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, SMS_QUEUE_HEADERS.length).getDisplayValues();
        pendingAfter += countQueueStatus_(rows, '대기');
      }
      // 한 번에 묶어서 씁니다 (행마다 한 줄씩 쓰면 500건까지 100초 넘게 걸리고, 그 사이 고객 주문이 막힙니다).
      sheet.getRange(lastRow + 1, 1, rowsToAdd.length, SMS_QUEUE_HEADERS.length).setValues(rowsToAdd);
    } finally {
      lock.releaseLock();
    }
    return respond({
      ok: true,
      queued: numbers.length,
      message: finalMessage,
      estimatedDays: estimatePromoDays_(pendingAfter, PROMO_DAILY_LIMIT),
      pending: pendingAfter
    });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보 문자 1건 테스트 발송 (관리자 전용, 배포 2) — 즉시 발송합니다.
 * body: { action: 'sendPromoTest', key: 관리자 키,
 *         message: 문자 내용, numbers?: [번호 1개], numbersText?: 번호 1개 }
 * 작성한 메시지를 입력한 1명에게만 보냅니다. 하루 한도(100건)에 포함되고
 * '문자발송기록' 탭에 남습니다.
 */
function sendPromoTest(data) {
  try {
    checkAdmin(data && data.key);
    if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) {
      return respond({ ok: false, error: 'SMS Gateway 계정을 먼저 입력하세요. (Code.gs의 SMSGATE_USERNAME·SMSGATE_PASSWORD)' });
    }
    var message = String((data && data.message) || '').trim();
    if (!message) return respond({ ok: false, error: '보낼 문자를 입력하세요.' });
    if (message.length > 2000) return respond({ ok: false, error: '문자는 2000자까지 보낼 수 있습니다.' });
    var numbers = parsePromoNumbers_((data && data.numbers) || (data && data.numbersText) || '');
    if (numbers.length !== 1) {
      return respond({ ok: false, error: '테스트 발송은 번호 1개만 보낼 수 있습니다. 테스트 번호를 1개만 입력하세요.' });
    }
    var today = todayKst_();
    var logSheet = getSmsLogSheet_();
    if (readTodaySent_(logSheet, today) >= PROMO_DAILY_LIMIT) {
      return respond({ ok: false, error: '오늘 하루 발송 한도(100건)를 모두 사용했습니다. 내일 다시 보내세요.' });
    }
    var finalMessage = buildPromoMessage_(message);
    var ok = false;
    try { ok = sendSmsViaSmsGate_(numbers[0], finalMessage); } catch (e) { ok = false; }
    var domestic = e164ToDomestic_(numbers[0]);
    logPromoSend_(logSheet, '홍보', finalMessage, 1, ok ? 1 : 0, ok ? 0 : 1, ok ? [] : [domestic]);
    if (ok) return respond({ ok: true, sent: 1, preview: finalMessage });
    return respond({ ok: false, error: '문자 발송에 실패했습니다. SMS Gateway 앱이 켜져 있고 Cloud Server에 연결됐는지 확인하세요.' });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보 문자 큐 처리기 — 시간 트리거(15분마다)로 실행됩니다.
 * 상태 '대기'인 행을 오래된 순으로 읽어, 한 번에 최대 4건까지만 보내고,
 * 건마다 60초 쉽니다. 4건이면 약 250초라 6분 실행 제한 안에 듭니다.
 * 하루 상한 100건(오늘 성공 합산)은 '문자발송기록' 탭으로 계산하고,
 * 남은 한도까지만 보냅니다. 보낸 행은 '발송완료'+발송일시, 실패는
 * '실패'+오류. 동시에 두 번 실행되지 않게, 행을 '발송중'으로 표시하는
 * 구간만 짧게 잠급니다. 15분 넘게 '발송중'인 행은 중단된 실행의 흔적이라
 * '대기'로 되돌려 다시 보냅니다.
 */
function processPromoQueue_() {
  var queueSheet = getPromoQueueSheet_();
  var logSheet = getSmsLogSheet_();
  var now = new Date();
  var today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  var stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  var todaySent = readTodaySent_(logSheet, today);
  var remaining = PROMO_DAILY_LIMIT - todaySent;
  if (remaining <= 0) {
    Logger.log('processPromoQueue_: 오늘 하루 한도(100건)를 모두 사용했습니다.');
    return;
  }

  var cutoffStamp = Utilities.formatDate(new Date(now.getTime() - 15 * 60 * 1000), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var batch = [];
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('processPromoQueue_: 다른 실행이 진행 중이라 이번에는 건너뜁니다.');
    return;
  }
  try {
    var qLast = queueSheet.getLastRow();
    if (qLast < 2) return;
    var qRows = queueSheet.getRange(2, 1, qLast - 1, SMS_QUEUE_HEADERS.length).getDisplayValues();
    for (var i = 0; i < qRows.length; i++) {
      if (String(qRows[i][3] || '') === '발송중') {
        var startedStr = String(qRows[i][4] || '');
        if (!startedStr || startedStr < cutoffStamp) {
          queueSheet.getRange(i + 2, 4).setValue('대기');
          queueSheet.getRange(i + 2, 5).setValue('');
          qRows[i][3] = '대기';
          qRows[i][4] = '';
        }
      }
    }
    var maxBatch = Math.min(PROMO_BATCH_SIZE, remaining);
    for (var j = 0; j < qRows.length && batch.length < maxBatch; j++) {
      if (String(qRows[j][3] || '') !== '대기') continue;
      var rowIndex = j + 2;
      queueSheet.getRange(rowIndex, 4).setValue('발송중');
      queueSheet.getRange(rowIndex, 5).setValue(stamp);
      batch.push({ row: rowIndex, phone: String(qRows[j][1] || '').trim(), message: String(qRows[j][2] || '') });
    }
  } finally {
    lock.releaseLock();
  }
  if (!batch.length) return;

  var results = sendPromoBatch_(batch, sendSmsViaSmsGate_, function (ms) { Utilities.sleep(ms); });
  for (var k = 0; k < batch.length; k++) {
    var item = batch[k];
    var res = results[k];
    var sentStamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    queueSheet.getRange(item.row, 4).setValue(res.ok ? '발송완료' : '실패');
    queueSheet.getRange(item.row, 6).setValue(sentStamp);
    if (!res.ok) queueSheet.getRange(item.row, 7).setValue(res.error || '발송 실패');
    logPromoSend_(logSheet, '홍보', item.message, 1, res.ok ? 1 : 0, res.ok ? 0 : 1, res.ok ? [] : [item.phone]);
  }
}

/** processPromoQueue_ 시간 트리거가 이미 있는지 확인합니다. */
function hasPromoTrigger_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processPromoQueue_') return true;
    }
  } catch (err) {
    Logger.log('hasPromoTrigger_ failed: ' + err);
  }
  return false;
}

/**
 * processPromoQueue_를 15분마다 실행하는 시간 트리거를 만듭니다.
 * 이미 있으면 새로 만들지 않습니다. 권한 문제로 만들 수 없으면 false를
 * 반환합니다 (편집기 → 트리거 → 트리거 추가 → processPromoQueue_
 * → 시간 기반 → 15분마다 로 직접 설치하세요).
 */
function setupPromoTrigger_() {
  if (hasPromoTrigger_()) return true;
  try {
    ScriptApp.newTrigger('processPromoQueue_').timeBased().everyMinutes(15).create();
    return true;
  } catch (err) {
    Logger.log('setupPromoTrigger_ failed: ' + err);
    return false;
  }
}

/** 홍보 문자 큐 트리거 설치 (관리자 전용, 배포 2) */
function setupPromoTrigger(data) {
  try {
    checkAdmin(data && data.key);
    if (setupPromoTrigger_()) return respond({ ok: true, installed: true });
    return respond({ ok: false, error: '트리거 설치에 실패했습니다. 편집기에서 직접 설치하세요 (트리거 → 트리거 추가 → processPromoQueue_ → 시간 기반 → 15분마다).' });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보 문자 예약 현황 (관리자 전용, 배포 2)
 * 반환: {ok, queue: {waiting, sending, done, failed},
 *         todaySent, limit, triggerInstalled, recent: [최신 10건]}
 * 최근 기록: [{date, kind, message, total, sent, failed, failedNumbers}]
 */
function getPromoStatus(data) {
  try {
    checkAdmin(data && data.key);
    var queueSheet = getPromoQueueSheet_();
    var logSheet = getSmsLogSheet_();
    var queue = { waiting: 0, sending: 0, done: 0, failed: 0 };
    var qLast = queueSheet.getLastRow();
    if (qLast >= 2) {
      var qRows = queueSheet.getRange(2, 1, qLast - 1, SMS_QUEUE_HEADERS.length).getDisplayValues();
      queue.waiting = countQueueStatus_(qRows, '대기');
      queue.sending = countQueueStatus_(qRows, '발송중');
      queue.done = countQueueStatus_(qRows, '발송완료');
      queue.failed = countQueueStatus_(qRows, '실패');
    }
    var today = todayKst_();
    var todaySent = readTodaySent_(logSheet, today);
    var recent = [];
    var lLast = logSheet.getLastRow();
    if (lLast >= 2) {
      var lRows = logSheet.getRange(2, 1, lLast - 1, SMS_LOG_HEADERS.length).getDisplayValues();
      var start = Math.max(0, lRows.length - 10);
      for (var i = lRows.length - 1; i >= start; i--) {
        recent.push({
          date: String(lRows[i][0] || ''),
          kind: String(lRows[i][1] || ''),
          message: String(lRows[i][2] || ''),
          total: Number(lRows[i][3] || 0),
          sent: Number(lRows[i][4] || 0),
          failed: Number(lRows[i][5] || 0),
          failedNumbers: String(lRows[i][6] || '')
        });
      }
    }
    return respond({
      ok: true,
      queue,
      todaySent,
      limit: PROMO_DAILY_LIMIT,
      triggerInstalled: hasPromoTrigger_(),
      recent
    });
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
