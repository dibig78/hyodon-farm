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

    // 홈페이지 사진 관리 (admin.html 사진 관리에서 보낸 요청)
    // body의 key는 관리자 키(기존 checkAdmin과 같은 규칙)이고,
    // 사진 슬롯은 slot 필드로 받습니다. (key를 슬롯으로 쓰면 키 확인과 겹칩니다)
    if (data.action === 'uploadPhoto') return uploadPhoto(data);
    if (data.action === 'deletePhoto') return deletePhoto(data);

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
  // 손님용 배송 조회 (track.html에서 ?action=track&phone=... 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'track') return trackGet(e.parameter.phone);
  // 홈페이지 사진 설정 조회 (index.html에서 ?action=photos 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'photos') return photosGet();
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
/** 사진 슬롯 키 — hero, 상품 4종 (홈페이지·관리자 양쪽과 같은 순서) */
var PHOTO_KEYS = ['hero', 'product-home', 'product-gift', 'product-mixed', 'product-golden-gift'];

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
    if (PHOTO_KEYS.indexOf(slot) < 0) {
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
    if (PHOTO_KEYS.indexOf(slot) < 0) {
      return respond({ ok: false, error: '알 수 없는 사진 슬롯입니다: ' + slot });
    }
    var sheet = getPhotosSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var keys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0] || '').trim() === slot) {
          sheet.deleteRow(i + 2);
          return respond({ ok: true, slot: slot });
        }
      }
    }
    return respond({ ok: true, slot: slot });
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
