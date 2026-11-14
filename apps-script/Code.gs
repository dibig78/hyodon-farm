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
 *   7) 새 주문 문자 알림 (Textbee): 주문이 접수되면 농원 전화번호로 문자 1건.
 *      키가 비어 있으면 건너뜁니다. 아래 '문자 알림' 절을 보세요.
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
 * Textbee API 키 — 문자 발송용 안드로이드 기기와 연결된 키입니다.
 * GitHub 저장소에는 빈칸으로 두고, Apps Script 편집기에서만 입력하세요.
 * 키 발급: https://textbee.dev 에서 계정 만들고 API 키 발급,
 * 발송용 안드로이드 폰에 Textbee 앱을 설치해 같은 계정으로 로그인합니다.
 * 키가 비어 있으면 문자 알림은 조용히 건너뛰고 주문은 정상 접수됩니다.
 */
var TEXTBEE_API_KEY = '';

/** 새 주문 알림 문자를 받을 농원 전화번호 (편집기에서 바꾸면 됩니다). */
var NOTIFY_PHONE = '010-2696-1326';

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

    // 새 주문 문자 알림 테스트 (admin.html에서 호출, 키 확인은 testNotify 안에서)
    if (data.action === 'testNotify') return testNotify(data);

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
 *  문자 알림 (Textbee) — 새 주문 시 농원에 문자 1건
 * ============================================================ */

/** Textbee 수신자 번호 형식으로 바꿉니다 (01012345678 -> +821012345678). */
function formatPhoneForTextbee_(phone) {
  var digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.indexOf('82') === 0 && digits.length > 10) return '+' + digits;
  if (digits.charAt(0) === '0') return '+82' + digits.substring(1);
  return '+82' + digits;
}

/** Textbee로 문자 1건을 보냅니다. 성공하면 true, 실패하면 false를 반환합니다. */
function sendSmsViaTextbee_(phone, message) {
  if (!TEXTBEE_API_KEY) return false;
  var to = formatPhoneForTextbee_(phone);
  if (!to || !message) return false;
  try {
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': TEXTBEE_API_KEY },
      payload: JSON.stringify({ recipients: [to], message: message }),
      muteHttpExceptions: true
    };
    var res = UrlFetchApp.fetch('https://api.textbee.dev/api/v1/gateway/send-sms', options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    Logger.log('Textbee send failed: HTTP ' + code + ' ' + res.getContentText());
    return false;
  } catch (err) {
    Logger.log('Textbee send error: ' + err);
    return false;
  }
}

/**
 * 새 주문이 들어오면 농원에 문자 1건을 보냅니다.
 * 메시지 예시:
 *   [효돈농원] 새 주문: 노지감귤 가정용 10kg 1박스 21,000원,
 *   테스트E 010-7777-9999 (입금자명: 테스트E)
 * 실패해도 주문 접수는 절대 막지 않습니다 (내부 try/catch + 키 없음 시 skip).
 */
function notifyNewOrder_(data, productText) {
  try {
    if (!TEXTBEE_API_KEY) return;
    var amount = Number(data.totalAmount || 0).toLocaleString();
    var message = '[효돈농원] 새 주문: ' + productText + ' ' + amount + '원, ' +
      data.ordererName + ' ' + data.ordererPhone +
      ' (입금자명: ' + data.depositor + ')';
    sendSmsViaTextbee_(NOTIFY_PHONE, message);
  } catch (err) {
    // 문자 실패가 주문 접수를 막지 않게 합니다.
    Logger.log('notifyNewOrder_ failed: ' + err);
  }
}

/**
 * 관리자 테스트용 (POST action=testNotify, 배포 2, checkAdmin 필수).
 * "[효돈농원] 문자 알림 테스트입니다."를 NOTIFY_PHONE으로 보냅니다.
 * 키가 비어 있으면 에러를 반환합니다.
 */
function testNotify(data) {
  checkAdmin(data && data.key);
  if (!TEXTBEE_API_KEY) {
    return respond({ ok: false, error: 'Textbee API 키를 먼저 입력하세요. (Code.gs의 TEXTBEE_API_KEY)' });
  }
  try {
    var ok = sendSmsViaTextbee_(NOTIFY_PHONE, '[효돈농원] 문자 알림 테스트입니다.');
    if (ok) return respond({ ok: true });
    return respond({ ok: false, error: '문자 발송에 실패했습니다. Textbee 앱이 켜져 있는지 확인하세요.' });
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
