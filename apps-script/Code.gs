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
 *   9) 홍보문구 버전 저장·홍보수신자 목록: '홍보문구버전'·'홍보수신자' 탭.
 *      수신자 목록은 '문자발송큐'에서 전화번호별 최근 발송을 찾아 함께 돌려주고,
 *      이름·메모는 인라인 편집(updatePromoRecipient)으로 고칩니다.
 *      예약할 때 목록에서 고른 번호로 보낼 수 있고, 수신거부된 번호는
 *      예약·테스트 발송에서 자동으로 걸러집니다.
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

/** 시트 1행 헤더 (index.html 설정과 순서가 같아야 합니다) — 14열째 우편번호와 15열째 상품별 배송지는 맨 뒤에 둡니다. */
var HEADERS = [
  '주문일시', '상품명', '수량', '총금액', '입금자명', '주문자',
  '주문자연락처', '받는분', '받는분연락처', '받는분주소', '요청사항', '입금확인', '송장번호',
  '우편번호', '상품별 배송지'
];

/** 상품별 배송지(주문 단위 deliveryOverrides)를 검증합니다.
 *  없으면 ''(통과), 있으면 각 항목의 이름·연락처·주소·주문 항목 매칭을
 *  확인하고, 문제가 있으면 오류 문구를 돌려줍니다. */
function validateDeliveryOverrides_(data) {
  var overrides = data && data.deliveryOverrides;
  if (!overrides) return '';
  if (!Array.isArray(overrides)) return '상품별 배송지 형식이 잘못되었습니다.';
  var itemIds = {};
  var items = data.items || [];
  for (var i = 0; i < items.length; i++) itemIds[items[i] && items[i].id] = true;
  for (var j = 0; j < overrides.length; j++) {
    var d = overrides[j] || {};
    if (!d.itemId || !itemIds[d.itemId]) return '상품별 배송지: 주문에 없는 상품이 있습니다.';
    if (!String(d.name || '').trim()) return '상품별 배송지: 받는 분 이름을 입력해 주세요.';
    if (String(d.phone || '').replace(/[^0-9]/g, '').length < 9) return '상품별 배송지: 받는 분 연락처를 정확히 입력해 주세요.';
    if (String(d.address || '').trim().length < 6) return '상품별 배송지: 배송받으실 주소를 입력해 주세요.';
  }
  return '';
}

/** 저장할 상품별 배송지 JSON을 만듭니다. 없으면 ''(빈칸 — 기존 주문과 하위 호환).
 *  알려진 필드만 골라 담아 시트에 쓸모없는 값이 안 들어갑니다. */
function deliveryOverridesJson_(data) {
  var overrides = data && data.deliveryOverrides;
  if (!overrides || !overrides.length) return '';
  var out = [];
  for (var i = 0; i < overrides.length; i++) {
    var d = overrides[i] || {};
    out.push({
      itemId: safe(d.itemId), itemName: safe(d.itemName),
      qty: Number(d.qty || 0), amount: Number(d.amount || 0),
      name: safe(d.name), phone: safe(d.phone),
      address: safe(d.address), detail: safe(d.detail),
      zipcode: safe(d.zipcode), trackingNumber: safe(d.trackingNumber)
    });
  }
  return JSON.stringify(out);
}

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
    if (data.action === 'setSplitTracking') return setSplitTracking(data);
    if (data.action === 'bulkImportTracking') return bulkImportTracking(data);
    if (data.action === 'sendCustomerSms') return sendCustomerSms(data);

    // 로젠택배 API 자동 연동 (admin.html 로젠 API에서 호출, 배포 2 관리자 전용)
    if (data.action === 'getLogenStatus') return getLogenStatus(data);
    if (data.action === 'setLogenSetting') return setLogenSetting(data);
    if (data.action === 'testLogenApi') return testLogenApi(data);
    if (data.action === 'issueLogenTracking') return issueLogenTracking(data);

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

    // 주문 알림 받는 번호 조회·저장 (admin.html 문자 보내기에서 호출, 배포 2 관리자 전용)
    if (data.action === 'getNotifyPhone') return getNotifyPhone(data);
    if (data.action === 'setNotifyPhone') return setNotifyPhone(data);

    // 입금 계좌 조회·저장 (admin.html 문자 보내기에서 호출, 배포 2 관리자 전용)
    if (data.action === 'getBankInfo') return getBankInfo(data);
    if (data.action === 'setBankInfo') return setBankInfo(data);

    // 전화번호 인증 켜기/끄기 (admin.html 문자 보내기에서 호출, 배포 2 관리자 전용)
    if (data.action === 'getPhoneVerifyEnabled') return getPhoneVerifyEnabled(data);
    if (data.action === 'setPhoneVerifyEnabled') return setPhoneVerifyEnabled(data);

    // 홍보 예약 편집·취소·다시 보내기 (admin.html 홍보 문자에서 호출, 배포 2 관리자 전용)
    if (data.action === 'updatePromo') return updatePromo(data);
    if (data.action === 'cancelPromo') return cancelPromo(data);
    if (data.action === 'retryPromo') return retryPromo(data);

    // 홍보문구 버전 저장·목록·삭제 (admin.html 홍보 문자에서 호출, 배포 2 관리자 전용)
    if (data.action === 'savePromoVersion') return savePromoVersion(data);
    if (data.action === 'listPromoVersions') return listPromoVersions(data);
    if (data.action === 'deletePromoVersion') return deletePromoVersion(data);

    // 홍보수신자 목록 관리 (admin.html 홍보 문자에서 호출, 배포 2 관리자 전용)
    if (data.action === 'addPromoRecipients') return addPromoRecipients(data);
    if (data.action === 'listPromoRecipients') return listPromoRecipients(data);
    if (data.action === 'deletePromoRecipient') return deletePromoRecipient(data);
    if (data.action === 'setPromoRecipientOptOut') return setPromoRecipientOptOut(data);
    if (data.action === 'updatePromoRecipient') return updatePromoRecipient(data);

    // 상품 관리 (admin.html 상품 관리에서 보낸 요청)
    if (data.action === 'upsertProduct') return upsertProduct(data);
    if (data.action === 'setProductActive') return setProductActive(data);

    // 전화번호 인증 (홈페이지 주문 폼에서 호출, 배포 1 공개 — 인증 없음)
    if (data.action === 'requestPhoneCode') return requestPhoneCode(data);
    if (data.action === 'verifyPhoneCode') return verifyPhoneCode(data);

    // 고객 문의 접수 (홈페이지 문의 폼에서 호출, 배포 1 공개 — 인증 없음)
    if (data.action === 'submitInquiry') return submitInquiry(data);
    // 고객 문의 목록·답변 (admin.html 문의 메뉴에서 호출, 배포 2 관리자 전용)
    if (data.action === 'listInquiries') return listInquiries(data);
    if (data.action === 'replyInquiry') return replyInquiry(data);

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

    // 전화번호는 한국 휴대폰 형식(010/011/016/017/018/019, 10~11자리)으로 검증합니다.
    if (!isValidMobileDigits_(normalizeMobileDigits_(data.ordererPhone))) {
      return respond({ ok: false, error: '주문자 연락처를 정확히 입력해 주세요.' });
    }
    if (!isValidMobileDigits_(normalizeMobileDigits_(data.receiverPhone))) {
      return respond({ ok: false, error: '받는 분 연락처를 정확히 입력해 주세요.' });
    }

    // 전화번호 인증이 켜져 있으면 주문자 전화 인증 토큰이 필요합니다.
    // 토큰은 1회용이라 유효하면 여기서 사용여부를 TRUE로 표시하고 계속합니다.
    // 꺼져 있으면 검사 없이 그대로 진행합니다.
    if (isPhoneVerifyEnabled_()) {
      if (!consumePhoneVerifyToken_(normalizeMobileDigits_(data.ordererPhone), String(data.phoneToken || ''))) {
        return respond({ ok: false, error: '전화번호 인증이 필요합니다. 인증번호를 받아 확인해 주세요.' });
      }
    }

    // 주문 내역 검증 — 상품 id가 있고 수량이 양의 정수인지, totalQty가
    // 항목 수량 합계와 일치하는지 확인합니다. totalAmount는 쉼표를 제거해
    // 숫자로 파싱하고 숫자가 아니면 주문을 거부합니다.
    var itemsQtySum = 0;
    for (var vi = 0; vi < data.items.length; vi++) {
      var vit = data.items[vi] || {};
      if (!String(vit.id || '').trim()) return respond({ ok: false, error: '주문 상품을 확인해 주세요.' });
      var vqty = Number(vit.qty);
      if (!isFinite(vqty) || vqty !== Math.floor(vqty) || vqty < 1) {
        return respond({ ok: false, error: '주문 수량을 확인해 주세요.' });
      }
      itemsQtySum += vqty;
    }
    if (Number(data.totalQty) !== itemsQtySum) {
      return respond({ ok: false, error: '주문 수량 합계가 맞지 않습니다.' });
    }
    var amountText = String(data.totalAmount == null ? '' : data.totalAmount).replace(/[^0-9]/g, '');
    if (amountText === '' || !isFinite(Number(amountText))) {
      return respond({ ok: false, error: '주문 금액을 확인해 주세요.' });
    }

    // 상품별 배송지가 있으면 검증합니다 (이름·연락처·주소 필수, 연락처 형식, 주문 항목 매칭).
    var splitError = validateDeliveryOverrides_(data);
    if (splitError) return respond({ ok: false, error: splitError });

    // 상품 가격을 서버에서 다시 계산합니다 (카탈로그 기준, 노출 중단 상품 제외).
    // 다시 계산에 실패하면(없는 상품·노출 중단 상품·수량 오류) 주문을 거부합니다 —
    // 클라이언트가 보낸 금액을 그대로 믿지 않습니다.
    // 다시 계산했으면 내역도 카탈로그 이름·가격으로 바꿔 응답에 담습니다.
    var repricedItems = repriceOrder_(data);
    if (!repricedItems) {
      return respond({ ok: false, error: '상품 정보를 확인해 주세요. (노출 중단된 상품이거나 수량이 올바르지 않습니다.)' });
    }

    var sheet = getSheet();
    ensureHeader(sheet);

    // 우편번호 열(N)은 텍스트 형식으로 둡니다 — 앞자리 0(예: 03045)이 숫자로 바뀌어 사라지지 않게, 쓰기 전에 미리 잡습니다.
    sheet.getRange(2, 14, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
    // 상품별 배송지 열(O)도 JSON 텍스트라 텍스트 형식으로 둡니다 — 따옴표·괄호가 수식이나 숫자로 바뀌지 않게, 쓰기 전에 미리 잡습니다.
    sheet.getRange(2, 15, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');

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
        '',   // 송장번호 (출고 후 입력)
        safe(data.receiverZipcode), // 우편번호 (없으면 빈칸 — 예전 주문·직접 입력도 받습니다)
        deliveryOverridesJson_(data) // 상품별 배송지 (JSON 텍스트, 없으면 빈칸)
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
    // 1단계 손님 문자: 주문 접수 뒤 주문자 전화로 자동 발송합니다.
    // 주문이 저장된 뒤라 실패해도 주문 접수는 그대로 성공입니다.
    notifyCustomerOrder_(data, productText);

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
  // 입금 계좌 조회 (index.html 결제 안내에서 ?action=bankInfo 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'bankInfo') return bankInfoGet();
  // 전화번호 인증 켜짐 여부 조회 (index.html 주문 폼에서 ?action=phoneVerifyStatus 로 호출, 키 없음)
  if (e && e.parameter && e.parameter.action === 'phoneVerifyStatus') return phoneVerifyStatus();
  // 고객 문의 목록 조회 (admin.html 문의 메뉴에서 ?action=inquiries 로 호출, 키 확인)
  if (e && e.parameter && e.parameter.action === 'inquiries') return listInquiries({ key: e.parameter.key });
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
// 단, 상품별 배송지는 본인 주문의 상품이 어디로 가는지 확인하는 데
// 필요해 포함한다 (전화번호 조회로 본인 주문만 보인다).
function trackGet(phone) {
  try {
    var digits = String(phone || '').replace(/[^0-9]/g, '');
    if (digits.length < 10 || digits.length > 11) return respond({ ok: false, error: '전화번호를 정확히 입력하세요.' });
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond({ ok: true, orders: [] });
    var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();
    var out = [];
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var ordPhone = String(r[6] || '').replace(/[^0-9]/g, '');
      var recvPhone = String(r[8] || '').replace(/[^0-9]/g, '');
      if (ordPhone !== digits && recvPhone !== digits) continue;
      out.push({
        datetime: r[0], product: r[1], qty: Number(r[2] || 0), amount: Number(String(r[3] || '0').replace(/[^0-9]/g, '') || 0),
        receiver: r[7], zipcode: r[13] || '',
        deliveryOverrides: parseDeliveryOverrides_(r[14]),
        paid: r[11] === '확인', tracking: r[12] || ''
      });
      if (out.length >= 20) break;
    }
    out.sort(function (a, b) { return String(b.datetime).localeCompare(String(a.datetime)); });
    return respond({ ok: true, orders: out });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 상품설정 탭을 이름→{id, name, price}으로 읽습니다 (탭을 만들지 않음).
 *  탭이 없거나 비어 있으면 기본 4종(FALLBACK_PRODUCTS)으로 봅니다. */
function readCatalogByName_() {
  var byName = {};
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  var rows = [];
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, PRODUCTS_HEADERS.length).getDisplayValues();
      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        var name = String(r[1] || '').trim();
        if (!name) continue;
        rows.push({
          id: String(r[0] || '').trim(),
          name: name,
          price: Number(String(r[2] || '0').replace(/[^0-9]/g, '') || 0)
        });
      }
    }
  }
  if (!rows.length) {
    for (var j = 0; j < FALLBACK_PRODUCTS.length; j++) {
      rows.push({ id: FALLBACK_PRODUCTS[j].id, name: FALLBACK_PRODUCTS[j].name, price: FALLBACK_PRODUCTS[j].price });
    }
  }
  for (var k = 0; k < rows.length; k++) byName[rows[k].name] = rows[k];
  return byName;
}

/** 주문 요약 텍스트("이름 N박스, 이름 N박스")를 상품별 내역으로 풉니다.
 *  카탈로그와 이름이 맞으면 id·단가·금액도 채웁니다 (상품별 통계용).
 *  풀이 안 되는 부분은 이름 통째로 수량 1건으로 둡니다. */
function parseOrderItems_(summary, catalogByName, orderAmount) {
  var items = [];
  var text = String(summary || '').trim();
  if (!text) return items;
  var parts = text.split(',');
  for (var i = 0; i < parts.length; i++) {
    var seg = String(parts[i] || '').trim();
    if (!seg) continue;
    var m = seg.match(/^(.*\S)\s+(\d+)박스\s*$/);
    var name = m ? m[1] : seg;
    var qty = m ? Number(m[2]) : 1;
    var cat = catalogByName ? catalogByName[name] : null;
    items.push({
      id: cat ? cat.id : '',
      name: name,
      qty: qty,
      price: cat ? cat.price : 0,
      amount: cat ? cat.price * qty : 0
    });
  }
  // N-P1-6 (gstack 오디트 2026-11-15): 상품별 금액은 주문 당시 금액으로
  // 맞춥니다. 카탈로그 가격을 나중에 바꾸면 현재 가격으로 과거 통계가
  // 다시 계산되는 문제를 막기 위해, 주문 당시 총액(orderAmount)에
  // 맞춰 비례 배분합니다. 단일 상품이면 정확히 총액이 되고, 여러
  // 상품이면 합계가 총액과 일치합니다 (반올림 나머지는 가장 큰 항목에
  // 몰아줍니다). price(카탈로그 단가)는 그대로 둡니다.
  if (typeof orderAmount === 'number' && orderAmount > 0 && items.length) {
    var rawTotal = 0;
    for (var j = 0; j < items.length; j++) rawTotal += items[j].amount;
    if (rawTotal > 0) {
      var bigIdx = 0;
      for (var k = 0; k < items.length; k++) {
        if (items[k].amount > items[bigIdx].amount) bigIdx = k;
      }
      var acc = 0;
      for (var a = 0; a < items.length; a++) {
        if (a === bigIdx) continue;
        items[a].amount = Math.round(items[a].amount * orderAmount / rawTotal);
        acc += items[a].amount;
      }
      items[bigIdx].amount = orderAmount - acc;
    } else {
      // 카탈로그에 없는 상품이라 금액이 0이면 총액을 첫 항목에 둡니다.
      items[0].amount = orderAmount;
    }
  }
  return items;
}

function adminList(key) {
  try {
    checkAdmin(key);
    var sheet = getSheet();
    ensureHeader(sheet);
    var lastRow = sheet.getLastRow();
    var orders = [];
    var catalogByName = readCatalogByName_();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();
      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        if (!String(r[0] || '').trim() && !String(r[5] || '').trim()) continue;
        var orderAmount = Number(String(r[3] || '0').replace(/[^0-9]/g, '') || 0);
        orders.push({
          row: i + 2,
          datetime: r[0], product: r[1], qty: Number(r[2] || 0),
          amount: orderAmount,
          items: parseOrderItems_(r[1], catalogByName, orderAmount),
          depositor: r[4], orderer: r[5], ordererPhone: r[6],
          receiver: r[7], receiverPhone: r[8], receiverAddress: r[9],
          zipcode: r[13] || '',
          deliveryOverrides: parseDeliveryOverrides_(r[14]),
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

/**
 * N-P1-8 (gstack 오디트 2026-11-15): 행 번호 식별 안전장치 — 쓰기 전에
 * 해당 행이 호출자가 기대한 주문인지 확인합니다. 다른 탭·사람이 주문을
 * 지우면 행 번호가 밀려, 범위 검사만으로는 엉뚱한 주문에 쓸 수 있습니다.
 * 호출자가 보낸 expectDate(주문일시, A열)·expectPhone(주문자 또는 받는분
 * 전화번호, G열·I열)이 있으면 그 행의 값과 대조하고, 다르면 오류를
 * 돌려줍니다. 지문 없이 온 오래된 호출은 그대로 허용합니다.
 * 반환: null(일치·지문 없음) 또는 오류 메시지.
 */
function checkRowFingerprint_(sheet, row, data) {
  var expectDate = String((data && data.expectDate) || '').trim();
  var expectPhone = String((data && data.expectPhone) || '').replace(/[^0-9]/g, '');
  if (!expectDate && !expectPhone) return null;
  var values = sheet.getRange(row, 1, 1, 9).getDisplayValues()[0];
  if (expectDate && String(values[0] || '').trim() !== expectDate) {
    return '주문 정보가 바뀌었습니다. 목록을 새로고침해 주세요.';
  }
  if (expectPhone) {
    var orderer = String(values[6] || '').replace(/[^0-9]/g, '');
    var receiver = String(values[8] || '').replace(/[^0-9]/g, '');
    if (orderer !== expectPhone && receiver !== expectPhone) {
      return '주문 정보가 바뀌었습니다. 목록을 새로고침해 주세요.';
    }
  }
  return null;
}

function adminUpdateBatch(data) {
  try {
    checkAdmin(data && data.key);
    var updates = (data && data.updates) || [];
    if (!updates.length) return respond({ ok: false, error: '업데이트할 주문이 없습니다.' });
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    // 2·3단계 손님 문자: 쓸 행의 이전 입금·송장 값을 보고 전환이 있을 때만
    // 보낼 목록을 모읍니다. 발송 자체는 락을 풀고 난 뒤에 합니다 (게이트웨이
    // 호출이 락을 오래 잡지 않게). bulkPaid도 이 함수(updateBatch)를
    // 쓰므로 입금 확인 일괄 처리에도 2단계가 자동 발송됩니다.
    var customerSms = [];
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // N-P1-8: lastRow는 락 안에서 다시 읽습니다 (락 밖 값은 삭제가
      // 끼면 이미 밀려 있을 수 있습니다).
      lastRow = sheet.getLastRow();
      // 지문은 쓰기 전에 전부 확인하고, 하나라도 다르면 아무것도 안 씁니다.
      for (var v = 0; v < updates.length; v++) {
        var uv = updates[v] || {};
        var rv = Number(uv.row || 0);
        if (!rv || rv < 2 || rv > lastRow) continue;
        var fpv = checkRowFingerprint_(sheet, rv, uv);
        if (fpv) return respond({ ok: false, error: fpv });
      }
      for (var i = 0; i < updates.length; i++) {
        var u = updates[i] || {};
        var row = Number(u.row || 0);
        if (!row || row < 2 || row > lastRow) continue;
        // 2·3단계 판정용 이전 값 (쓰기 전에 읽음).
        var before = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
        var wasPaid = String(before[11] || '').trim() === '확인';
        var wasTracking = String(before[12] || '').trim();
        var ordererPhone = String(before[6] || '').trim();
        var receiverPhone = String(before[8] || '').trim();
        var newTracking = String(u.tracking || '').trim();
        sheet.getRange(row, 12).setValue(u.paid ? '확인' : '');
        // M열(13): 송장번호 — 앞자리 0이 사라지지 않게 텍스트 형식으로 저장
        sheet.getRange(row, 13).setNumberFormat('@').setValue(safe(u.tracking));
        // 2단계: 입금이 false→true로 바뀔 때만 주문자 전화로 보냄.
        // 이미 입금된 주문을 다시 저장해도 재발송하지 않음.
        if (!wasPaid && u.paid && ordererPhone) {
          customerSms.push({ phone: ordererPhone, message: CUSTOMER_PAID_MESSAGE });
        }
        // 3단계: 송장번호가 새로 들어갈 때만 받는 분 전화로 보냄.
        // 이미 있던 번호를 다시 저장해도 재발송하지 않음.
        if (!wasTracking && newTracking && receiverPhone) {
          customerSms.push({ phone: receiverPhone, message: customerShippedMessage_(newTracking) });
        }
      }
    } finally {
      lock.releaseLock();
    }
    // 락을 풀고 손님 문자를 보냅니다 (발송 실패가 업데이트를 막지 않음).
    for (var s = 0; s < customerSms.length; s++) {
      notifyCustomer_(customerSms[s].phone, customerSms[s].message);
    }
    return respond({ ok: true, updated: updates.length });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 삭제된 주문 복구용 기록 탭 — 행 전체 내용을 삭제 전에 남깁니다.
 *  헤더는 [삭제일시, 주문행] + 주문 시트 HEADERS 15열과 같습니다. */
var DELETE_LOG_SHEET_NAME = '삭제기록';
var DELETE_LOG_HEADERS = ['삭제일시', '주문행'].concat(HEADERS);

/** '삭제기록' 탭을 가져옵니다. 없으면 헤더와 함께 만듭니다. */
function getDeleteLogSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(DELETE_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DELETE_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, DELETE_LOG_HEADERS.length).setValues([DELETE_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 관리자 주문 삭제 — 행을 지우기 전에 전체 내용을 '삭제기록' 탭에 남겨
 *  복구할 수 있게 합니다. (하드 삭제는 유지하되 기록을 남김.)
 *  락 안에서 행 범위 확인·기록·삭제를 한 번에 해서, 다른 탭·사람이
 *  동시에 지울 때 행 번호가 밀려 엉뚱한 주문을 지우는 일을 막습니다. */
function adminDelete(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number(data && data.row || 0);
    if (!row || row < 2) return respond({ ok: false, error: '잘못된 행 번호입니다.' });
    var sheet = getSheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // 행 범위 검사는 락 안에서 다시 합니다 (검사-삭제 사이에 다른 삭제가
      // 행 번호를 밀 수 있어서, 락 밖 검사는 믿을 수 없습니다).
      if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
      // N-P1-8: 지문이 있으면 이 행이 지우려는 주문인지 확인합니다.
      var fpDel = checkRowFingerprint_(sheet, row, data);
      if (fpDel) return respond({ ok: false, error: fpDel });
      // 삭제 전에 행 전체 내용을 '삭제기록' 탭에 남깁니다 (복구용).
      var values = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
      var logSheet = getDeleteLogSheet_();
      var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      logSheet.appendRow([stamp, row].concat(values));
      sheet.deleteRow(row);
    } finally {
      lock.releaseLock();
    }
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
    // 2·3단계 손님 문자: 이전 입금·송장 값을 보고 전환이 있을 때만
    // 보낼 목록을 모읍니다. 발송은 락을 풀고 난 뒤에 합니다.
    var customerSms = [];
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // N-P1-8: 범위와 지문은 락 안에서 다시 확인합니다 (락 밖 검사는
      // 그 사이에 행이 밀리면 믿을 수 없습니다).
      if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
      var fpUpd = checkRowFingerprint_(sheet, row, data);
      if (fpUpd) return respond({ ok: false, error: fpUpd });
      // 2·3단계 판정용 이전 값 (쓰기 전에 읽음).
      var before = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
      var wasPaid = String(before[11] || '').trim() === '확인';
      var wasTracking = String(before[12] || '').trim();
      var ordererPhone = String(before[6] || '').trim();
      var receiverPhone = String(before[8] || '').trim();
      var newTracking = String(data.tracking || '').trim();
      // L열(12): 입금확인 — 체크되면 '확인'이라고 적고, 해제되면 비웁니다.
      sheet.getRange(row, 12).setValue(data.paid ? '확인' : '');
      // M열(13): 송장번호 — 앞자리 0이 사라지지 않게 텍스트 형식으로 저장
      sheet.getRange(row, 13).setNumberFormat('@').setValue(safe(data.tracking));
      // 2단계: 입금이 false→true로 바뀔 때만 주문자 전화로 보냄.
      if (!wasPaid && data.paid && ordererPhone) {
        customerSms.push({ phone: ordererPhone, message: CUSTOMER_PAID_MESSAGE });
      }
      // 3단계: 송장번호가 새로 들어갈 때만 받는 분 전화로 보냄.
      if (!wasTracking && newTracking && receiverPhone) {
        customerSms.push({ phone: receiverPhone, message: customerShippedMessage_(newTracking) });
      }
    } finally {
      lock.releaseLock();
    }
    // 락을 풀고 손님 문자를 보냅니다 (발송 실패가 업데이트를 막지 않음).
    for (var s = 0; s < customerSms.length; s++) {
      notifyCustomer_(customerSms[s].phone, customerSms[s].message);
    }
    return respond({ ok: true, row: row });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 배송지별 송장번호 저장 (admin.html에서 호출, 배포 2 관리자 전용).
 *  {row, itemIds[], trackingNumber}를 받아 해당 주문 행의 O열(JSON)을 읽어
 *  itemIds에 해당하는 오버라이드들의 trackingNumber를 설정(빈 값이면 비움)하고,
 *  O열에 '@' 텍스트 형식으로 다시 씁니다. 같은 주소 그룹은 itemIds 전부를
 *  넘기면 한 번에 동기화됩니다. 새 열은 만들지 않습니다. */
function setSplitTracking(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number(data && data.row || 0);
    if (!row || row < 2) return respond({ ok: false, error: '잘못된 행 번호입니다.' });
    var sheet = getSheet();
    if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
    var itemIds = (data && data.itemIds) || [];
    if (!Array.isArray(itemIds) || !itemIds.length) return respond({ ok: false, error: '송장번호를 저장할 상품을 선택해 주세요.' });
    // 송장번호는 숫자만 허용 — 앞자리 0은 문자열 그대로 두어 유지합니다.
    var tracking = String(data && data.trackingNumber || '').replace(/[^0-9]/g, '');
    // 3단계 손님 문자 (분리 배송지): 이 배송지 그룹에 송장번호가 새로
    // 들어갈 때만 받는 분 전화로 보냅니다. 발송은 락을 풀고 난 뒤에 합니다.
    var customerSms = [];
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // N-P1-8: 범위와 지문은 락 안에서 다시 확인합니다.
      if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
      var fpSplit = checkRowFingerprint_(sheet, row, data);
      if (fpSplit) return respond({ ok: false, error: fpSplit });
      var raw = sheet.getRange(row, 15).getDisplayValue();
      var overrides = parseDeliveryOverrides_(raw);
      if (!overrides.length) return respond({ ok: false, error: '상품별 배송지가 없는 주문입니다.' });
      var wanted = {};
      for (var i = 0; i < itemIds.length; i++) wanted[String(itemIds[i])] = true;
      var matched = 0;
      // 전화번호별 새로 송장이 들어간 상품명 (같은 주소 그룹은 한 통으로 합침).
      var notifyByPhone = {};
      for (var j = 0; j < overrides.length; j++) {
        if (wanted[overrides[j].itemId]) {
          // 3단계: 이 상품에 송장번호가 새로 들어갈 때만 보냄.
          // 이미 있던 번호를 다시 저장해도 재발송하지 않음.
          var oldTracking = String(overrides[j].trackingNumber || '').trim();
          if (!oldTracking && tracking) {
            var ph = String(overrides[j].phone || '').trim();
            if (ph) {
              if (!notifyByPhone[ph]) notifyByPhone[ph] = [];
              notifyByPhone[ph].push(
                (overrides[j].itemName || overrides[j].itemId) + ' ' + (Number(overrides[j].qty) || 0) + '박스'
              );
            }
          }
          overrides[j].trackingNumber = tracking;
          matched++;
        }
      }
      if (!matched) return respond({ ok: false, error: '해당 상품이 없습니다.' });
      for (var ph2 in notifyByPhone) {
        customerSms.push({
          phone: ph2,
          message: '[효돈농원] 출고되었습니다. ' + notifyByPhone[ph2].join(', ') +
            ' 송장번호 ' + tracking + ', 로젠택배에서 조회할 수 있습니다. 내일·모레 도착합니다.'
        });
      }
      // O열(15): JSON 텍스트 — 따옴표·괄호가 수식이나 숫자로 바뀌지 않게 텍스트 형식으로 다시 씁니다.
      sheet.getRange(row, 15).setNumberFormat('@').setValue(JSON.stringify(overrides));
    } finally {
      lock.releaseLock();
    }
    // 락을 풀고 손님 문자를 보냅니다 (발송 실패가 저장을 막지 않음).
    for (var s = 0; s < customerSms.length; s++) {
      notifyCustomer_(customerSms[s].phone, customerSms[s].message);
    }
    return respond({ ok: true, row: row, itemIds: itemIds, trackingNumber: tracking });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 상품별 배송지 오버라이드를 배송지(받는분·연락처·주소)별로 묶습니다.
 *  waybill.ts groupDeliveryOverrides와 같은 키(받는분|연락처 숫자|주소|상세|우편번호)를
 *  씁니다. 그룹의 송장번호는 그룹 안 첫 번째로 있는 번호입니다. */
function groupDeliveryOverrides_(overrides) {
  var groups = [];
  for (var i = 0; i < (overrides || []).length; i++) {
    var d = overrides[i];
    if (!d || !d.itemId) continue;
    var key = [
      String(d.name || '').trim(),
      String(d.phone || '').replace(/[^0-9]/g, ''),
      String(d.address || '').trim(),
      String(d.detail || '').trim(),
      String(d.zipcode || '').trim()
    ].join('|');
    var g = null;
    for (var j = 0; j < groups.length; j++) if (groups[j].key === key) { g = groups[j]; break; }
    if (!g) {
      g = {
        key: key,
        name: String(d.name || ''),
        phone: String(d.phone || ''),
        address: String(d.address || ''),
        detail: String(d.detail || ''),
        zipcode: String(d.zipcode || ''),
        items: [],
        trackingNumber: ''
      };
      groups.push(g);
    }
    g.items.push(d);
    if (!g.trackingNumber && d.trackingNumber) g.trackingNumber = String(d.trackingNumber);
  }
  return groups;
}

/** 송장번호 일괄 입력 (admin.html에서 호출, 배포 2 관리자 전용).
 *  {items: [{phone, trackingNumber}]}를 받아 전화번호로 주문을 찾아 송장번호를
 *  넣어줍니다. 전화번호는 받는분·주문자 연락처, 상품별 배송지 받는분 순으로
 *  찾습니다. 이미 송장번호가 있는 주문은 덮지 않고 건너뜁니다.
 *  같은 전화번호로 주문·배송지가 여러 곳이면 'ambiguous'로 건너뜁니다.
 *  새 열은 만들지 않습니다 (대표 송장은 M열, 분리 송장은 O열 JSON). */
function bulkImportTracking(data) {
  try {
    checkAdmin(data && data.key);
    var items = (data && data.items) || [];
    if (!Array.isArray(items) || !items.length) return respond({ ok: false, error: '입력할 송장번호가 없습니다.' });
    if (items.length > 500) return respond({ ok: false, error: '한 번에 입력할 수 있는 건수는 최대 500건입니다.' });
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    var results = [];
    var summary = { imported: 0, not_found: 0, already_tracked: 0, ambiguous: 0, format_error: 0 };
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      // 주문 전체를 한 번 읽어 전화번호로 찾습니다 (읽은 뒤로는 메모리를 고쳐
      // 같은 목록 안의 다음 줄이 이미 입력된 송장을 보게 합니다).
      var values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues() : [];
      var orders = [];
      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        if (!String(r[0] || '').trim() && !String(r[5] || '').trim()) continue;
        orders.push({
          row: i + 2,
          product: r[1],
          receiver: r[7],
          receiverPhone: String(r[8] || '').replace(/[^0-9]/g, ''),
          ordererPhone: String(r[6] || '').replace(/[^0-9]/g, ''),
          tracking: String(r[12] || '').trim(),
          overrides: parseDeliveryOverrides_(r[14])
        });
      }
      for (var k = 0; k < items.length; k++) {
        var it = items[k] || {};
        var phone = String(it.phone || '').replace(/[^0-9]/g, '');
        var tracking = String(it.trackingNumber || '').replace(/[^0-9]/g, '');
        var base = { phone: phone, trackingNumber: tracking };
        // 서버에서 한 번 더 검증합니다 (형식 오류는 클라이언트에서 거르지만 직접 호출도 안전하게).
        if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
          results.push({ phone: phone, trackingNumber: tracking, status: 'format_error', message: '전화번호 형식이 잘못되었습니다. (010 등으로 시작하는 10~11자리)' });
          summary.format_error++;
          continue;
        }
        if (!/^[0-9]{10,12}$/.test(tracking)) {
          results.push({ phone: phone, trackingNumber: tracking, status: 'format_error', message: '송장번호는 숫자 10~12자리여야 합니다.' });
          summary.format_error++;
          continue;
        }
        // 전화번호가 일치하는 곳(주문)을 찾습니다. 한 주문 안에서도 대표
        // 받는분/주문자와 분리 배송지 받는분이 따로 있을 수 있어, 대상
        // (대표 송장 또는 배송지 그룹) 단위로 모읍니다.
        var targets = [];
        for (var m = 0; m < orders.length; m++) {
          var o = orders[m];
          if (o.receiverPhone === phone || o.ordererPhone === phone) {
            targets.push({ order: o, kind: 'main' });
          }
          var groups = groupDeliveryOverrides_(o.overrides);
          for (var s = 0; s < groups.length; s++) {
            if (String(groups[s].phone || '').replace(/[^0-9]/g, '') === phone) {
              targets.push({ order: o, kind: 'split', group: groups[s] });
            }
          }
        }
        if (!targets.length) {
          results.push({ phone: phone, trackingNumber: tracking, status: 'not_found', message: '일치하는 주문이 없습니다.' });
          summary.not_found++;
          continue;
        }
        if (targets.length > 1) {
          var seenRows = {};
          var candidates = [];
          for (var c = 0; c < targets.length; c++) {
            var cr = targets[c].order.row;
            if (!seenRows[cr]) {
              seenRows[cr] = true;
              candidates.push({ row: cr, product: targets[c].order.product, receiver: targets[c].order.receiver });
            }
          }
          if (candidates.length > 1) {
            results.push({
              phone: phone, trackingNumber: tracking, status: 'ambiguous',
              message: '같은 전화번호로 주문이 여러 건 있습니다. 개별 입력으로 넣어주세요.',
              candidates: candidates
            });
            summary.ambiguous++;
            continue;
          }
          // N-P1-5 (gstack 오디트 2026-11-15): 같은 주문 안의 대표+분리
          // 배송지가 같은 전화번호면 모호하지 않습니다 — 같은 사람이 받는
          // 주문이니까, 송장이 없는 곳 하나를 골라 넣습니다. 송장 없는
          // 곳이 여러 곳이면 대표(기본 배송지)를 먼저 씁니다. 전부 이미
          // 송장이 있으면 already_tracked로 돌려줍니다. 다른 주문이
          // 섞인 경우(여러 행)는 위에서 그대로 ambiguous입니다.
          var open = [];
          for (var oi = 0; oi < targets.length; oi++) {
            var t = targets[oi];
            var has = t.kind === 'main' ? !!t.order.tracking : !!(t.group.trackingNumber || '');
            if (!has) open.push(t);
          }
          if (!open.length) {
            results.push({ phone: phone, trackingNumber: tracking, status: 'already_tracked', row: targets[0].order.row, product: targets[0].order.product, receiver: targets[0].order.receiver, message: '이미 송장번호가 있습니다. 덮어쓰지 않았습니다.' });
            summary.already_tracked++;
            continue;
          }
          var chosen = open[0];
          for (var ci = 0; ci < open.length; ci++) {
            if (open[ci].kind === 'main') { chosen = open[ci]; break; }
          }
          targets = [chosen];
        }
        var one = targets[0];
        var order = one.order;
        if (one.kind === 'main') {
          if (order.tracking) {
            results.push({ phone: phone, trackingNumber: tracking, status: 'already_tracked', row: order.row, product: order.product, receiver: order.receiver, target: 'main', message: '이미 대표 송장번호가 있습니다. 덮어쓰지 않았습니다.' });
            summary.already_tracked++;
            continue;
          }
          // M열(13): 송장번호 — 앞자리 0이 사라지지 않게 텍스트 형식으로 저장
          sheet.getRange(order.row, 13).setNumberFormat('@').setValue(safe(tracking));
          order.tracking = tracking;
          results.push({ phone: phone, trackingNumber: tracking, status: 'imported', row: order.row, product: order.product, receiver: order.receiver, target: 'main', message: '대표 송장번호를 입력했습니다.' });
          summary.imported++;
        } else {
          var group = one.group;
          if (group.trackingNumber) {
            results.push({ phone: phone, trackingNumber: tracking, status: 'already_tracked', row: order.row, product: order.product, receiver: group.name, target: 'split', message: '이미 이 배송지 송장번호가 있습니다. 덮어쓰지 않았습니다.' });
            summary.already_tracked++;
            continue;
          }
          // O열(15): 같은 주소 그룹 상품 전부에 같은 송장번호를 넣어 동기화합니다.
          for (var q = 0; q < group.items.length; q++) group.items[q].trackingNumber = tracking;
          group.trackingNumber = tracking;
          sheet.getRange(order.row, 15).setNumberFormat('@').setValue(JSON.stringify(order.overrides));
          results.push({ phone: phone, trackingNumber: tracking, status: 'imported', row: order.row, product: order.product, receiver: group.name, target: 'split', message: '상품별 배송지 송장번호를 입력했습니다.' });
          summary.imported++;
        }
      }
    } finally {
      lock.releaseLock();
    }
    // 3단계 손님 문자 (일괄 입력): 새로 들어간 건만 해당 전화로 보냅니다.
    // 'imported'만 대상 — 이미 있던 번호(already_tracked)는 재발송하지 않고,
    // 못 찾았거나 모호한 건은 발송하지 않습니다. 발송 실패가 일괄 입력을
    // 막지 않습니다 (notifyCustomer_가 try/catch로 감쌉니다).
    for (var s = 0; s < results.length; s++) {
      var r = results[s] || {};
      if (r.status === 'imported' && r.phone && r.trackingNumber) {
        notifyCustomer_(r.phone, customerShippedMessage_(String(r.trackingNumber)));
      }
    }
    return respond({ ok: true, results: results, summary: summary });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  로젠택배 API 자동 연동 (송장 자동 발급)
 *  - 조사 결과 (2026-11-14, docs/logen-api-setup.md 참고):
 *    · 로젠택배 공식 오픈API는 2026-11-08 기준 '서비스 준비중'이라
 *      공개 엔드포인트·인증 방식이 없습니다. 공식 API를 쓰려면
 *      계약 지점(올레영업소)에서 사업자 API 정보를 받아야 합니다.
 *    · 중개 서비스 deliveryapi.co.kr는 로젠을 '조회'만 지원하고
 *      발송 등록(송장 발급)은 롯데·CJ만 지원합니다. 로젠 발급 불가.
 *    · 중개 서비스 Homepick3.0 / LogiKorea는 로젠 발급을 지원한다고
 *      안내하지만, 상세 엔드포인트·필드는 승인·가입 뒤에만 받습니다.
 *  - 그래서 엔드포인트·인증·요청 템플릿·응답의 송장번호 필드를
 *    전부 '설정' 탭(LOGEN_*)으로 받는 설정 가능한 어댑터로 만들었습니다.
 *    API 정보를 받으면 설정만 채우면 바로 구동됩니다. 코드에
 *    엔드포인트·키를 하드코딩하지 않습니다.
 *  - 설정이 없으면 '미연결'로 조용히 대기합니다 (오류 없이, 주문
 *    접수는 그대로 됩니다). API 호출 실패가 주문을 망가뜨리지 않게
 *    모든 호출은 try/catch로 감싸고 실패 사유를 돌려줍니다.
 *  - 이미 송장번호가 있는 배송에는 새로 발급하지 않습니다 (중복
 *    발송 방지). 발급은 실제 운송장을 만드는 동작이라, 테스트 주문에
 *    발급하면 실제 송장이 생기니 실주문에 써주세요.
 *  - 관리자 액션 (배포 2, checkAdmin): getLogenStatus,
 *    setLogenSetting, testLogenApi, issueLogenTracking.
 *    비밀값(API 키)은 상태 조회에서도 절대 반환하지 않습니다.
 * ============================================================ */

/** 로젠 API 설정 키 허용 목록 (setLogenSetting에서 이 키만 저장합니다). */
var LOGEN_SETTING_KEYS = [
  'LOGEN_ENABLED', 'LOGEN_PROVIDER', 'LOGEN_API_URL', 'LOGEN_API_KEY',
  'LOGEN_API_AUTH', 'LOGEN_API_AUTH_HEADER', 'LOGEN_API_METHOD',
  'LOGEN_API_REQUEST_TEMPLATE', 'LOGEN_API_TRACKING_FIELD',
  'LOGEN_CUSTOMER_CODE', 'LOGEN_SENDER_NAME', 'LOGEN_SENDER_PHONE',
  'LOGEN_SENDER_ADDRESS', 'LOGEN_SENDER_ZIPCODE', 'LOGEN_API_TEST_URL'
];

/** 보내는 분(농원) 기본값 — 공개 사업장 정보라 코드 기본값으로 둡니다.
 *  설정(LOGEN_SENDER_*)이 있으면 설정이 우선합니다. */
var LOGEN_DEFAULT_SENDER = {
  name: '효돈농원',
  phone: '010-2696-1326',
  address: '제주특별자치도 서귀포시 칠십리로 636',
  zipcode: ''
};

/** 기본 요청 템플릿(예시 JSON) — 제공자 문서에 맞는 형태로 바꿔야 합니다.
 *  따옴표 안의 "{{키}}"는 JSON 문자열로, 따옴표 없는 {{수량}}·{{금액}}·
 *  {{무게}}·{{행}}·{{품목JSON}}은 숫자/JSON 값 그대로 치환합니다.
 *  자리표 목록은 docs/logen-api-setup.md를 참고하세요. */
var LOGEN_DEFAULT_REQUEST_TEMPLATE = [
  '{',
  '  "sender": {',
  '    "name": "{{senderName}}",',
  '    "phone": "{{senderPhone}}",',
  '    "address": "{{senderAddress}}",',
  '    "zipcode": "{{senderZipcode}}"',
  '  },',
  '  "receiver": {',
  '    "name": "{{receiverName}}",',
  '    "phone": "{{receiverPhone}}",',
  '    "address": "{{receiverAddress}}",',
  '    "detail": "{{receiverDetail}}",',
  '    "zipcode": "{{receiverZipcode}}"',
  '  },',
  '  "parcel": { "weightKg": {{weightKg}}, "items": "{{itemsText}}" },',
  '  "items": {{itemsJson}},',
  '  "customerCode": "{{customerCode}}",',
  '  "orderRow": {{orderRow}},',
  '  "memo": "{{memo}}"',
  '}'
].join('\n');

/** 로젠 API 설정을 '설정' 탭에서 읽어 돌려줍니다. 비밀값은 이 함수
 *  안에서만 쓰고, 상태 조회에는 여부(있음/없음)만 넘깁니다. */
function getLogenConfig_() {
  var enabled = String(getSetting_('LOGEN_ENABLED') || '').trim().toLowerCase();
  var url = String(getSetting_('LOGEN_API_URL') || '').trim();
  var apiKey = String(getSetting_('LOGEN_API_KEY') || '').trim();
  var template = String(getSetting_('LOGEN_API_REQUEST_TEMPLATE') || '').trim();
  if (!template) template = LOGEN_DEFAULT_REQUEST_TEMPLATE;
  var sender = {
    name: String(getSetting_('LOGEN_SENDER_NAME') || '').trim() || LOGEN_DEFAULT_SENDER.name,
    phone: String(getSetting_('LOGEN_SENDER_PHONE') || '').trim() || LOGEN_DEFAULT_SENDER.phone,
    address: String(getSetting_('LOGEN_SENDER_ADDRESS') || '').trim() || LOGEN_DEFAULT_SENDER.address,
    zipcode: String(getSetting_('LOGEN_SENDER_ZIPCODE') || '').trim() || LOGEN_DEFAULT_SENDER.zipcode
  };
  return {
    enabled: enabled === 'true',
    configured: !!(url && apiKey),
    provider: String(getSetting_('LOGEN_PROVIDER') || '').trim() || 'logen',
    url: url,
    apiKey: apiKey,
    auth: (String(getSetting_('LOGEN_API_AUTH') || '').trim().toLowerCase()) || 'bearer',
    authHeader: String(getSetting_('LOGEN_API_AUTH_HEADER') || '').trim() || 'Authorization',
    method: (String(getSetting_('LOGEN_API_METHOD') || '').trim().toUpperCase()) || 'POST',
    template: template,
    trackingField: String(getSetting_('LOGEN_API_TRACKING_FIELD') || '').trim(),
    customerCode: String(getSetting_('LOGEN_CUSTOMER_CODE') || '').trim(),
    testUrl: String(getSetting_('LOGEN_API_TEST_URL') || '').trim(),
    sender: sender
  };
}

/** 로젠 API 연동 상태 (관리자용, D2). 비밀값은 절대 반환하지 않고
 *  여부(있음/없음)와 설정 값만 돌려줍니다. */
function getLogenStatus(data) {
  try {
    checkAdmin(data && data.key);
    var cfg = getLogenConfig_();
    var status = !cfg.configured ? '미연결' : (cfg.enabled ? '연결됨' : '비활성');
    return respond({
      ok: true,
      enabled: cfg.enabled,
      configured: cfg.configured,
      provider: cfg.provider,
      hasKey: !!cfg.apiKey,
      hasUrl: !!cfg.url,
      hasTemplate: !!cfg.template,
      hasTrackingField: !!cfg.trackingField,
      status: status,
      settings: {
        provider: cfg.provider,
        apiUrl: cfg.url,
        auth: cfg.auth,
        authHeader: cfg.authHeader,
        method: cfg.method,
        template: cfg.template,
        trackingField: cfg.trackingField,
        customerCode: cfg.customerCode,
        senderName: cfg.sender.name,
        senderPhone: cfg.sender.phone,
        senderAddress: cfg.sender.address,
        senderZipcode: cfg.sender.zipcode,
        testUrl: cfg.testUrl,
        enabled: cfg.enabled
      }
    });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 로젠 API 설정 저장 (관리자용, D2). LOGEN_* 키만 허용합니다.
 *  API 키는 빈 값이면 기존 값을 유지합니다 (지우려면 편집기에서 직접 지우세요). */
function setLogenSetting(data) {
  try {
    checkAdmin(data && data.key);
    var key = String((data && data.settingKey) || '').trim();
    if (LOGEN_SETTING_KEYS.indexOf(key) < 0) {
      return respond({ ok: false, error: '저장할 수 없는 설정 키입니다.' });
    }
    var value = (data && data.value !== undefined && data.value !== null) ? String(data.value) : '';
    if (key === 'LOGEN_API_KEY' && value === '') {
      return respond({ ok: true, key: key, unchanged: true });
    }
    setSetting_(key, value);
    return respond({ ok: true, key: key });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 요청 템플릿(JSON)에 배송 값을 채워 요청 본문 객체를 만듭니다.
 *  따옴표 안의 "{{키}}"는 JSON 문자열로(따옴표·백슬래시 자동 이스케이프),
 *  따옴표 없는 {{수량}}·{{금액}}·{{무게}}·{{행}}·{{품목JSON}}은 숫자/JSON 값
 *  그대로 치환합니다. 모르는 자리표가 남으면 오류를 돌려줍니다
 *  (잘못된 요청을 안 보냅니다). */
function buildLogenRequestBody_(config, shipment) {
  var text = String(config.template || '');
  if (!text.trim()) return { error: '로젠 API 요청 템플릿이 비어 있습니다.' };
  var vals = {
    senderName: config.sender.name, senderPhone: config.sender.phone,
    senderAddress: config.sender.address, senderZipcode: config.sender.zipcode,
    receiverName: shipment.receiverName, receiverPhone: shipment.receiverPhone,
    receiverAddress: shipment.receiverAddress, receiverDetail: shipment.receiverDetail || '',
    receiverZipcode: shipment.receiverZipcode || '',
    itemsText: shipment.itemsText, productNames: shipment.productNames,
    customerCode: config.customerCode, memo: shipment.memo || '',
    orderDate: shipment.orderDate || '',
    date: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'),
    qty: String(shipment.qty), amount: String(shipment.amount),
    weightKg: String(shipment.weightKg), orderRow: String(shipment.orderRow)
  };
  // 1) 품목 JSON — 따옴표 있든 없든 JSON 배열 그대로 넣습니다.
  var itemsJson = JSON.stringify(shipment.items || []);
  text = text.split('"{{itemsJson}}"').join(itemsJson);
  text = text.split('{{itemsJson}}').join(itemsJson);
  // 2) 따옴표 안 자리표 → JSON 문자열로 치환합니다.
  for (var k in vals) {
    var quoted = '"{{' + k + '}}"';
    if (text.indexOf(quoted) >= 0) text = text.split(quoted).join(JSON.stringify(vals[k]));
  }
  // 3) 따옴표 없는 숫자 자리표 → 숫자 그대로 치환합니다.
  var numKeys = ['qty', 'amount', 'weightKg', 'orderRow'];
  for (var i = 0; i < numKeys.length; i++) {
    text = text.split('{{' + numKeys[i] + '}}').join(vals[numKeys[i]]);
  }
  // 4) 남은 자리표가 있으면 오류 (제공자 전용 필드는 문서의 목록에 맞게 고쳐주세요).
  var left = text.match(/\{\{[a-zA-Z0-9_]+\}\}/);
  if (left) {
    return { error: '요청 템플릿에 알 수 없는 자리표가 있습니다: ' + left[0] + ' — docs/logen-api-setup.md의 자리표 목록을 확인하세요.' };
  }
  var body = null;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return { error: '요청 템플릿이 올바른 JSON이 아닙니다: ' + String(e) };
  }
  return { body: body };
}

/** 응답 객체에서 송장번호를 찾습니다. 지정된 경로(점 표기)를 먼저 보고,
 *  없으면 응답 전체가 송장번호인지, 흔한 송장번호 키가 있는지 봅니다. */
function extractTrackingNumber_(data, fieldPath) {
  if (fieldPath) {
    var v = getPathValue_(data, fieldPath);
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  if (typeof data === 'string' && /^[0-9]{8,15}$/.test(data.trim())) return data.trim();
  var keys = ['trackingNumber', 'invoiceNo', 'waybillNo', 'trackingNo', '운송장번호', 'invoice_number', 'waybill_number'];
  if (data && typeof data === 'object') {
    for (var i = 0; i < keys.length; i++) {
      var val = data[keys[i]];
      if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
    }
    var inner = data.data || data.result || data.body;
    if (inner && typeof inner === 'object') {
      for (var j = 0; j < keys.length; j++) {
        var iv = inner[keys[j]];
        if (iv !== undefined && iv !== null && String(iv).trim() !== '') return String(iv).trim();
      }
    }
  }
  return '';
}

/** 점 표기 경로("data.trackingNumber")로 객체 안 값을 읽습니다. */
function getPathValue_(obj, path) {
  var cur = obj;
  var parts = String(path).split('.');
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/** 로젠 API 오류 응답에서 사람이 읽을 수 있는 메시지를 뽑습니다. */
function providerErrorText_(res) {
  var d = res && res.data;
  if (d && typeof d === 'object') {
    var m = d.message || d.error || d.msg || (d.data && (d.data.message || d.data.error));
    if (m) return String(m);
  }
  var t = String((res && res.text) || '');
  return t ? t.slice(0, 300) : '';
}

/** 로젠 API를 호출합니다. 인증 방식은 설정(LOGEN_API_AUTH)대로 적용합니다.
 *  bearer = Authorization: Bearer 키 / header = 지정 헤더에 키 /
 *  basic = Authorization: Basic base64(키) (키에 콜론이 있으면 그대로,
 *  없으면 키: 로 인코딩) / query = URL에 ?apiKey=키 를 붙입니다. */
function callLogenApi_(config, bodyObj) {
  var url = config.url;
  var headers = {};
  var auth = (config.auth || 'bearer').toLowerCase();
  if (auth === 'bearer') {
    headers[config.authHeader || 'Authorization'] = 'Bearer ' + config.apiKey;
  } else if (auth === 'header') {
    headers[config.authHeader || 'X-Api-Key'] = config.apiKey;
  } else if (auth === 'basic') {
    var basicKey = String(config.apiKey || '');
    if (basicKey.indexOf(':') < 0) basicKey = basicKey + ':';
    headers['Authorization'] = 'Basic ' + Utilities.base64Encode(basicKey);
  } else if (auth === 'query') {
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 'apiKey=' + encodeURIComponent(config.apiKey);
  } else {
    return { ok: false, error: '지원하지 않는 인증 방식입니다: ' + config.auth };
  }
  var options = {
    method: (config.method || 'POST').toUpperCase(),
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(bodyObj),
    muteHttpExceptions: true
  };
  var res;
  try {
    res = UrlFetchApp.fetch(url, options);
  } catch (err) {
    return { ok: false, error: '로젠 API 호출에 실패했습니다: ' + String(err) };
  }
  var status = 0;
  var text = '';
  try { status = res.getResponseCode(); } catch (e) { status = 0; }
  try { text = res.getContentText() || ''; } catch (e) { text = ''; }
  var parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  }
  return { ok: status >= 200 && status < 300, status: status, data: parsed, text: text };
}

/** 상품명에서 "10kg" 같은 무게를 읽어 총 무게(kg)를 추정합니다.
 *  없으면 10kg/박스로 봅니다. 어디까지나 추정이라 템플릿 {{weightKg}}용입니다. */
function estimateWeightKgFromItems_(items) {
  var total = 0;
  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i] || {};
    var name = String(it.name || it.itemName || '');
    var m = name.match(/([0-9]+(?:\.[0-9]+)?)\s*kg/i);
    var per = m ? parseFloat(m[1]) : 10;
    total += per * (Number(it.qty) || 0);
  }
  return total > 0 ? Math.round(total * 10) / 10 : 0;
}

/** 주문 요약 문자열("... 10kg 2박스, ... 5kg 1박스")에서 무게를 추정합니다.
 *  구간별로 kg와 박스 수를 곱해 더합니다. 못 읽으면 박스 수 × 10kg으로 봅니다. */
function estimateWeightKgFromSummary_(summary, totalQty) {
  var total = 0;
  var parts = String(summary || '').split(',');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var kgm = p.match(/([0-9]+(?:\.[0-9]+)?)\s*kg/i);
    var boxm = p.match(/([0-9]+)\s*박스/);
    var kg = kgm ? parseFloat(kgm[1]) : 10;
    var boxes = boxm ? Number(boxm[1]) : 0;
    if (boxes > 0) total += kg * boxes;
  }
  if (total > 0) return Math.round(total * 10) / 10;
  return Math.max(0, Number(totalQty) || 0) * 10;
}

/** 주문 행에서 로젠 API에 보낼 배송 정보를 만듭니다.
 *  itemIds가 있으면 그 상품들이 속한 분리 배송지 그룹을, 없으면 기본
 *  배송지를 대상으로 합니다. 이미 송장번호가 있으면 alreadyTracked를
 *  돌려줍니다 (중복 발급 방지). */
function buildLogenShipment_(sheet, row, itemIds) {
  var values = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
  var totalQty = Number(values[2]) || 0;
  var totalAmount = Number(String(values[3] || '').replace(/[^0-9]/g, '')) || 0;
  var overrides = parseDeliveryOverrides_(values[14]);
  var memo = String(values[10] || '');
  var orderDate = String(values[0] || '');
  if (itemIds && itemIds.length) {
    var groups = groupDeliveryOverrides_(overrides);
    var wanted = {};
    for (var i = 0; i < itemIds.length; i++) wanted[String(itemIds[i])] = true;
    var group = null;
    for (var g = 0; g < groups.length; g++) {
      var has = false;
      for (var k = 0; k < groups[g].items.length; k++) {
        if (wanted[groups[g].items[k].itemId]) { has = true; break; }
      }
      if (has) { group = groups[g]; break; }
    }
    if (!group) return { error: '해당 상품의 배송지를 찾을 수 없습니다.' };
    var gItems = group.items.map(function (d) {
      return { itemId: d.itemId, name: d.itemName, qty: Number(d.qty) || 0, amount: Number(d.amount) || 0 };
    });
    var gQty = 0, gAmount = 0;
    for (var q = 0; q < gItems.length; q++) { gQty += gItems[q].qty; gAmount += gItems[q].amount; }
    return {
      kind: 'split', itemIds: gItems.map(function (d) { return d.itemId; }),
      receiverName: group.name, receiverPhone: group.phone,
      receiverAddress: group.address, receiverDetail: group.detail,
      receiverZipcode: group.zipcode,
      items: gItems,
      itemsText: gItems.map(function (d) { return d.name + ' ' + d.qty + '박스'; }).join(', '),
      productNames: gItems.map(function (d) { return d.name; }).join(', '),
      qty: gQty, amount: gAmount,
      weightKg: estimateWeightKgFromItems_(gItems),
      trackingNumber: group.trackingNumber || '',
      alreadyTracked: !!(group.trackingNumber || ''),
      orderDate: orderDate, orderRow: row, memo: memo
    };
  }
  // 기본 배송지 — 오버라이드에 없는 상품이 기본 주소로 갑니다.
  var ovQty = 0, ovAmount = 0;
  for (var o = 0; o < overrides.length; o++) { ovQty += Number(overrides[o].qty) || 0; ovAmount += Number(overrides[o].amount) || 0; }
  var mainQty = Math.max(0, totalQty - ovQty);
  var mainAmount = Math.max(0, totalAmount - ovAmount);
  var mainTracking = String(values[12] || '').trim();
  var summary = String(values[1] || '');
  return {
    kind: 'main', itemIds: [],
    receiverName: String(values[7] || ''), receiverPhone: String(values[8] || ''),
    receiverAddress: String(values[9] || ''), receiverDetail: '',
    receiverZipcode: String(values[13] || '').trim(),
    items: [{ name: summary, qty: mainQty, amount: mainAmount }],
    itemsText: summary,
    productNames: summary,
    qty: mainQty, amount: mainAmount,
    weightKg: estimateWeightKgFromSummary_(summary, mainQty),
    trackingNumber: mainTracking,
    alreadyTracked: !!mainTracking,
    orderDate: orderDate, orderRow: row, memo: memo
  };
}

/** 로젠 API 연결 테스트 (관리자용, D2). 실제 송장을 발행하지 않습니다.
 *  설정·템플릿을 검증하고, 테스트 URL이 있으면 그 URL에 가볍게(GET)
 *  호출해 응답 상태만 확인합니다. 테스트 URL이 없으면 설정 검증
 *  결과만 돌려줍니다. */
function testLogenApi(data) {
  try {
    checkAdmin(data && data.key);
    var cfg = getLogenConfig_();
    if (!cfg.configured) {
      return respond({ ok: false, error: '미연결: 로젠 API URL과 API 키를 먼저 입력하세요. (로젠 올레영업소에서 API 정보를 받아야 합니다.)' });
    }
    if (!/^https?:\/\/.+/.test(cfg.url)) {
      return respond({ ok: false, error: '로젠 API URL이 올바른 주소가 아닙니다: ' + cfg.url });
    }
    // 템플릿이 JSON으로 풀리는지 예시 배송 정보로 검사합니다.
    var sample = {
      receiverName: '테스트', receiverPhone: '010-0000-0000',
      receiverAddress: '테스트 주소', receiverDetail: '', receiverZipcode: '',
      items: [{ name: '테스트 상품', qty: 1, amount: 0 }],
      itemsText: '테스트 상품 1박스', productNames: '테스트 상품',
      qty: 1, amount: 0, weightKg: 10, orderRow: 0, orderDate: '', memo: ''
    };
    var bodyCheck = buildLogenRequestBody_(cfg, sample);
    if (bodyCheck.error) return respond({ ok: false, error: bodyCheck.error });
    if (!cfg.testUrl) {
      return respond({
        ok: true, tested: false,
        message: '설정과 요청 템플릿이 올바른 JSON입니다. 테스트 URL이 없어 연결 상태(HTTP)까지는 확인하지 못했습니다. 실제 발급은 주문에서 자동 발급으로 확인하세요.'
      });
    }
    var res = callLogenApi_({ url: cfg.testUrl, apiKey: cfg.apiKey, auth: cfg.auth, authHeader: cfg.authHeader, method: 'GET' }, {});
    var reachable = res.status > 0;
    var msg = reachable
      ? (res.ok
        ? '테스트 URL에 닿았습니다 (HTTP ' + res.status + ').'
        : '테스트 URL 서버에는 닿았으나 HTTP ' + res.status + '를 받았습니다. 발급 URL이 맞는지, 인증이 맞는지 확인하세요.')
      : ('테스트 URL에 닿지 못했습니다: ' + (res.error || '연결 실패'));
    return respond({ ok: res.ok && reachable, tested: true, status: res.status, message: msg });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 로젠 API로 송장 자동 발급 (관리자용, D2).
 *  {row, itemIds?(분리 배송지 그룹이면 해당 상품들)}를 받아, 해당 배송
 *  (기본 배송지면 대표 송장 M열, 분리 배송지면 O열 JSON)에 송장번호를
 *  넣어줍니다. 이미 송장번호가 있으면 새로 발급하지 않고 오류를 돌려줍니다
 *  (중복 발송 방지). API 실패가 주문 자체를 망가뜨리지 않게 try/catch로
 *  감싸고, 실패 사유를 그대로 돌려줍니다.
 *  동시성: 재검사·API 호출·기록을 하나의 락 구간 안에서 직렬화합니다.
 *  락 밖에서만 검사하면 두 번 동시 호출이 둘 다 '미발급'으로 보고
 *  운송장을 2장 만들어, 나중 쓴 값이 먼저 발급된 송장을 덮어씁니다.
 *  (송장번호 칸에 '발급중' 표식을 쓰는 대신 락을 잡고 호출하는 쪽을
 *  택했습니다 — 표식은 손님 배송 조회에 그대로 보여 혼란을 주기 때문.)
 *  발급은 관리자 수동 클릭이라 드물어, 호출 중 락을 잡고 있어도
 *  다른 관리 작업이 오래 기다리지 않습니다. */
function issueLogenTracking(data) {
  try {
    checkAdmin(data && data.key);
    var cfg = getLogenConfig_();
    if (!cfg.enabled || !cfg.configured) {
      return respond({ ok: false, error: '미연결: 로젠 API가 연결되지 않았습니다. 설정에서 API URL과 키를 입력하고 활성화하세요.' });
    }
    var row = Number((data && data.row) || 0);
    if (!row || row < 2) return respond({ ok: false, error: '잘못된 행 번호입니다.' });
    var itemIds = (data && data.itemIds) || null;
    var sheet = getSheet();
    if (row > sheet.getLastRow()) return respond({ ok: false, error: '없는 주문입니다.' });
    // 빠른 사전 검사 (락 없이) — 이미 발급됐으면 API를 부르지 않고 끝냅니다.
    var shipment = buildLogenShipment_(sheet, row, itemIds);
    if (shipment.error) return respond({ ok: false, error: shipment.error });
    if (shipment.alreadyTracked) {
      return respond({ ok: false, error: '이미 송장번호가 있습니다. (' + shipment.trackingNumber + ') 새로 발급하지 않았습니다.' });
    }
    // N-P1-2: 수량이 0인 배송지에는 송장을 발급하지 않습니다. 기본 배송지
    // 수량이 0이면 모든 상품이 별도 배송지로 나뉜 주문 — 대표 송장을
    // 발급하면 0박스짜리 25kg 운송장이 만들어집니다.
    if (shipment.qty <= 0) {
      return respond({ ok: false, error: shipment.kind === 'main'
        ? '기본 배송지에 보낼 상품이 없습니다. 모든 상품이 별도 배송지로 나뉘었습니다.'
        : '이 배송지에 보낼 상품이 없습니다.' });
    }
    var bodyRes = buildLogenRequestBody_(cfg, shipment);
    if (bodyRes.error) return respond({ ok: false, error: bodyRes.error });
    // 재검사·API 호출·기록을 하나의 락 구간 안에서 직렬화합니다.
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var fresh = buildLogenShipment_(sheet, row, itemIds);
      if (fresh.error) return respond({ ok: false, error: fresh.error });
      if (fresh.alreadyTracked) {
        return respond({ ok: false, error: '이미 송장번호가 있습니다. (' + fresh.trackingNumber + ') 새로 발급하지 않았습니다.' });
      }
      // N-P1-2: 락 안에서 다시 확인 — 사전 검사와 API 호출 사이에 주문이
      // 바뀌어 기본 수량이 0이 됐을 수 있습니다.
      if (fresh.qty <= 0) {
        return respond({ ok: false, error: fresh.kind === 'main'
          ? '기본 배송지에 보낼 상품이 없습니다. 모든 상품이 별도 배송지로 나뉘었습니다.'
          : '이 배송지에 보낼 상품이 없습니다.' });
      }
      var res = callLogenApi_(cfg, bodyRes.body);
      if (!res.ok) {
        return respond({ ok: false, error: '로젠 API 호출 실패 (HTTP ' + res.status + '): ' + (providerErrorText_(res) || '응답을 확인하세요.') });
      }
      var tracking = extractTrackingNumber_(
        (res.data !== null && res.data !== undefined) ? res.data : res.text, cfg.trackingField);
      tracking = String(tracking || '').replace(/[^0-9]/g, '');
      if (!tracking) {
        return respond({ ok: false, error: '송장번호를 응답에서 찾지 못했습니다. 응답의 송장번호 필드(LOGEN_API_TRACKING_FIELD)를 확인하세요. 응답: ' + String(res.text || '').slice(0, 200) });
      }
      if (fresh.kind === 'split') {
        var raw = sheet.getRange(row, 15).getDisplayValue();
        var overrides = parseDeliveryOverrides_(raw);
        var wanted = {};
        for (var i = 0; i < fresh.itemIds.length; i++) wanted[String(fresh.itemIds[i])] = true;
        var matched = 0;
        for (var j = 0; j < overrides.length; j++) {
          if (wanted[overrides[j].itemId]) { overrides[j].trackingNumber = tracking; matched++; }
        }
        if (!matched) return respond({ ok: false, error: '해당 상품이 없습니다.' });
        sheet.getRange(row, 15).setNumberFormat('@').setValue(JSON.stringify(overrides));
      } else {
        sheet.getRange(row, 13).setNumberFormat('@').setValue(tracking);
      }
      return respond({ ok: true, row: row, kind: fresh.kind, trackingNumber: tracking });
    } finally {
      lock.releaseLock();
    }
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
 *    계산합니다 (repriceOrder_ — 노출 중단 상품 제외, 수량은 양의
 *    정수만). 탭이 비어 있으면 기본 4종으로 계산하고, 탭에 없는 상품·
 *    노출 중단 상품·수량 오류가 섞여 있으면 주문을 거부합니다
 *    (클라이언트가 보낸 금액을 그대로 믿지 않습니다).
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
 * 노출 중단(active=false) 상품은 byId에 넣지 않아 주문할 수 없고,
 * 수량이 양의 정수가 아니면 null을 돌려줘 주문을 거부하게 합니다.
 * 상품설정 탭이 비어 있으면 기본 4종(FALLBACK_PRODUCTS)으로 계산합니다.
 * 탭에 없는 상품이 하나라도 섞여 있으면 전체를 거부합니다
 * (일부만 다시 계산하면 내역과 합계가 어긋나기 때문입니다).
 * 성공하면 data.totalAmount·data.totalQty·data.productSummary를 갱신하고,
 * 카탈로그 기준 내역을 배열로 돌려줍니다.
 */
function repriceOrder_(data) {
  // 카탈로그가 비어 있으면 기본 4종으로 다시 계산합니다 (홈페이지 기본값과 같음).
  var rows = readProducts_();
  if (!rows.length) {
    rows = FALLBACK_PRODUCTS.map(function (p) {
      return { id: p.id, name: p.name, price: p.price, active: true };
    });
  }
  // 노출 중단(active=false) 상품은 주문할 수 없게 byId에서 뺍니다.
  var byId = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].active) byId[rows[i].id] = rows[i];
  }
  var items = data.items || [];
  if (!items.length) return null;
  var total = 0;
  var totalQty = 0;
  var repriced = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j] || {};
    var catalog = byId[it.id];
    if (!catalog) return null;
    // 수량은 양의 정수만 받습니다 (0·음수·소수·숫자 아님은 주문 거부).
    var qty = Number(it.qty);
    if (!isFinite(qty) || qty !== Math.floor(qty) || qty < 1) return null;
    var amount = catalog.price * qty;
    total += amount;
    totalQty += qty;
    repriced.push({ id: it.id, name: catalog.name, qty: qty, price: catalog.price, amount: amount });
  }
  data.totalAmount = total;
  data.totalQty = totalQty;
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
    var notifyPhone = getNotifyPhone_();
    var ok = false;
    try { ok = sendSmsViaSmsGate_(notifyPhone, message); } catch (e) { ok = false; }
    // 주문 알림도 '문자발송기록' 탭에 남깁니다 (구분 '주문알림').
    // 기록 쓰기가 실패해도 주문 접수와 문자 발송 결과에는 영향이 없습니다.
    try {
      var logSheet = getSmsLogSheet_();
      logPromoSend_(logSheet, '주문알림', message, 1, ok ? 1 : 0, ok ? 0 : 1, ok ? [] : [notifyPhone]);
    } catch (logErr) {
      Logger.log('notifyNewOrder_ log failed: ' + logErr);
    }
  } catch (err) {
    // 문자 실패가 주문 접수를 막지 않게 합니다.
    Logger.log('notifyNewOrder_ failed: ' + err);
  }
}

/* ============================================================
 *  손님용 문자 알림 3단계 (주문 접수·입금 확인·출고) — 전부 자동 발송
 *  - 1단계: doPost에서 주문 저장 뒤 주문자 전화로 발송 (계좌 포함).
 *  - 2단계: 입금 상태가 false→true로 바뀔 때만 주문자 전화로 발송.
 *  - 3단계: 송장번호가 새로 들어갈 때만 받는 분 전화로 발송.
 *  - '문자발송기록' 탭에 구분 '고객알림'으로 남깁니다 (성공/실패 모두).
 *    홍보 하루 한도 계산(countTodaySent_은 '홍보'만 합산)에는 들어가지
 *    않습니다. 문자 실패가 주문 접수·관리자 업데이트를 절대 막지 않게
 *    모든 발송은 try/catch로 감싸고 실패는 로그만 남깁니다.
 * ============================================================ */

/** 2단계 문구 (입금 확인) */
var CUSTOMER_PAID_MESSAGE = '[효돈농원] 입금이 확인되었습니다. 오늘 출고합니다. 내일·모레 도착합니다.';

/** 3단계 문구 (출고) — tracking은 송장번호 */
function customerShippedMessage_(tracking) {
  return '[효돈농원] 출고되었습니다. 송장번호 ' + tracking + ', 로젠택배에서 조회할 수 있습니다. 내일·모레 도착합니다.';
}

/**
 * 손님용 문자 1건을 보냅니다 (주문 접수·입금 확인·출고 알림 공용).
 * sendSmsViaSmsGate_와 같은 게이트웨이로 보내고, '문자발송기록' 탭에
 * 구분 '고객알림'으로 남깁니다 (성공/실패 모두). 절대 throw하지 않습니다 —
 * 실패는 로그만 남기고 false를 반환합니다. 주문 접수나 관리자 업데이트가
 * 문자 실패로 망가지면 안 됩니다. 성공하면 true를 반환합니다.
 */
function notifyCustomer_(phone, message) {
  try {
    if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) return false;
    if (!phone || !message) return false;
    var ok = false;
    try { ok = sendSmsViaSmsGate_(phone, message); } catch (e) { ok = false; }
    // 고객 알림도 '문자발송기록' 탭에 남깁니다 (구분 '고객알림').
    // 기록 쓰기가 실패해도 주문 접수·관리자 업데이트와 문자 발송 결과에는
    // 영향이 없습니다.
    try {
      var logSheet = getSmsLogSheet_();
      logPromoSend_(logSheet, '고객알림', message, 1, ok ? 1 : 0, ok ? 0 : 1, ok ? [] : [phone]);
    } catch (logErr) {
      Logger.log('notifyCustomer_ log failed: ' + logErr);
    }
    return ok;
  } catch (err) {
    Logger.log('notifyCustomer_ failed: ' + err);
    return false;
  }
}

/**
 * 1단계 — 손님용 주문 접수 문자 (doPost에서 주문 저장 뒤 자동 발송).
 * 메시지: 계좌 있으면 "[효돈농원] 주문이 접수되었습니다. {상품} {금액}원,
 *   {은행} {계좌}({예금주})로 입금해주세요. 입금자명: {입금자명}"
 *   계좌 없으면 "[효돈농원] 주문이 접수되었습니다. {상품} {금액}원,
 *   입금 계좌는 농원에서 확인 후 문자로 안내드립니다. 입금자명: {입금자명}"
 *   (계좌 없으면 홈페이지 완료 화면도 "문자로 안내"라 뜨므로, 홈페이지로
 *   보내지 않고 같은 문구로 통일 — 순환 참조 방지, 2026-11-15)
 * 주문자 전화로 보냅니다. 절대 throw하지 않습니다 (notifyCustomer_가 보장).
 */
function notifyCustomerOrder_(data, productText) {
  try {
    var amount = Number(data.totalAmount || 0).toLocaleString();
    var bankInfo = getBankInfo_();
    var message;
    if (bankInfo) {
      message = '[효돈농원] 주문이 접수되었습니다. ' + productText + ' ' + amount + '원, ' +
        bankInfo.bank + ' ' + bankInfo.account + '(' + bankInfo.holder + ')로 입금해주세요. 입금자명: ' + data.depositor;
    } else {
      message = '[효돈농원] 주문이 접수되었습니다. ' + productText + ' ' + amount + '원, ' +
        '입금 계좌는 농원에서 확인 후 문자로 안내드립니다. 입금자명: ' + data.depositor;
    }
    return notifyCustomer_(data.ordererPhone, message);
  } catch (err) {
    Logger.log('notifyCustomerOrder_ failed: ' + err);
    return false;
  }
}

/**
 * 손님 문자 수동 발송 (admin.html 주문 상세 "고객 문자 보내기"에서 호출, 배포 2 관리자 전용).
 * {row, stage: 'order'|'paid'|'shipped', groupIndex?}를 받아 해당 주문의
 * 손님 전화로 1·2·3단계 문자를 직접 보냅니다 (자동 알림이 안 갔거나 손님이
 * 못 받았을 때 다시 보내기용).
 * - 'order': 주문자 전화로 1단계 주문 접수 문자 (notifyCustomerOrder_ 재사용,
 *   계좌 있으면 포함, 없으면 "입금 계좌는 농원에서 확인 후 문자로 안내" 문구).
 * - 'paid': 주문자 전화로 2단계 입금 확인 문자 (CUSTOMER_PAID_MESSAGE).
 * - 'shipped': groupIndex 0 = 기본 배송지(받는 분 전화, 대표 송장), 1+ = 분리
 *   배송지 그룹 순서(해당 그룹 받는 분 전화, 그룹 송장, 문구에 상품명 포함).
 *   해당 그룹에 송장번호가 없으면 발송하지 않고 에러를 돌려줍니다.
 * 시트를 쓰지 않으므로 락은 안 잡습니다. 발송 실패 시 {ok:false, error}를
 * 돌려주고, throw하지 않습니다 (주문·관리자 상태는 건드리지 않습니다).
 */
function sendCustomerSms(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number(data && data.row || 0);
    if (!row || row < 2) return respond({ ok: false, error: '주문을 찾을 수 없습니다.' });
    var stage = String(data && data.stage || '');
    if (stage !== 'order' && stage !== 'paid' && stage !== 'shipped') {
      return respond({ ok: false, error: '문자 종류를 확인해 주세요.' });
    }
    var sheet = getSheet();
    if (row > sheet.getLastRow()) return respond({ ok: false, error: '주문을 찾을 수 없습니다.' });
    var r = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
    var productText = String(r[1] || '').trim();
    var totalAmount = Number(String(r[3] || '').replace(/[^0-9]/g, '') || 0);
    var depositor = String(r[4] || '').trim();
    var ordererPhone = normalizeMobileDigits_(String(r[6] || '').trim());
    var receiverPhone = normalizeMobileDigits_(String(r[8] || '').trim());
    if (stage === 'order') {
      if (!isValidMobileDigits_(ordererPhone)) return respond({ ok: false, error: '전화번호를 확인해 주세요.' });
      var okOrder = notifyCustomerOrder_({ totalAmount: totalAmount, ordererPhone: ordererPhone, depositor: depositor }, productText);
      if (!okOrder) return respond({ ok: false, error: '문자 발송에 실패했습니다.' });
      return respond({ ok: true, stage: stage, phone: ordererPhone });
    }
    if (stage === 'paid') {
      if (!isValidMobileDigits_(ordererPhone)) return respond({ ok: false, error: '전화번호를 확인해 주세요.' });
      var okPaid = notifyCustomer_(ordererPhone, CUSTOMER_PAID_MESSAGE);
      if (!okPaid) return respond({ ok: false, error: '문자 발송에 실패했습니다.' });
      return respond({ ok: true, stage: stage, phone: ordererPhone });
    }
    // 'shipped' — groupIndex 0 = 기본 배송지, 1+ = 분리 배송지 그룹 순서.
    var groupIndex = Number(data && data.groupIndex || 0);
    if (groupIndex < 0) groupIndex = 0;
    var phone, tracking, itemsText = '';
    if (groupIndex === 0) {
      phone = receiverPhone;
      tracking = String(r[12] || '').trim();
    } else {
      var overrides = parseDeliveryOverrides_(String(r[14] || ''));
      var groups = groupDeliveryOverrides_(overrides);
      var g = groups[groupIndex - 1];
      if (!g) return respond({ ok: false, error: '해당 배송지가 없습니다.' });
      phone = normalizeMobileDigits_(String(g.phone || '').trim());
      tracking = String(g.trackingNumber || '').trim();
      itemsText = g.items.map(function (d) {
        return (d.itemName || d.itemId) + ' ' + (Number(d.qty) || 0) + '박스';
      }).join(', ');
    }
    if (!tracking) return respond({ ok: false, error: '송장번호가 없습니다. 송장번호를 먼저 입력해 주세요.' });
    if (!isValidMobileDigits_(phone)) return respond({ ok: false, error: '전화번호를 확인해 주세요.' });
    var message = itemsText
      ? '[효돈농원] 출고되었습니다. ' + itemsText + ' 송장번호 ' + tracking + ', 로젠택배에서 조회할 수 있습니다. 내일·모레 도착합니다.'
      : customerShippedMessage_(tracking);
    var okShipped = notifyCustomer_(phone, message);
    if (!okShipped) return respond({ ok: false, error: '문자 발송에 실패했습니다.' });
    return respond({ ok: true, stage: stage, groupIndex: groupIndex, phone: phone });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 관리자 테스트용 (POST action=testSmsGate, 배포 2, checkAdmin 필수).
 * "[효돈농원] 문자 알림 테스트입니다."를 주문 알림 받는 번호(설정에 저장된
 * 값, 없으면 NOTIFY_PHONE 상수)로 보냅니다. 계정이 비어 있으면 에러를
 * 반환합니다.
 */
function testSmsGate(data) {
  checkAdmin(data && data.key);
  if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) {
    return respond({ ok: false, error: 'SMS Gateway 계정을 먼저 입력하세요. (Code.gs의 SMSGATE_USERNAME·SMSGATE_PASSWORD)' });
  }
  try {
    var notifyPhone = getNotifyPhone_();
    var ok = sendSmsViaSmsGate_(notifyPhone, '[효돈농원] 문자 알림 테스트입니다.');
    if (ok) return respond({ ok: true });
    return respond({ ok: false, error: '문자 발송에 실패했습니다. SMS Gateway 앱이 켜져 있고 Cloud Server에 연결됐는지 확인하세요.' });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  설정 탭 (key/value) — 주문 알림 받는 번호 등 관리자 설정 저장용
 *  - '설정' 탭: 열 [key, value]. 없으면 만들 때 헤더를 채웁니다.
 *  - NOTIFY_PHONE은 '설정' 탭에 key 'NOTIFY_PHONE'으로 저장합니다.
 *    저장된 값이 없거나 형식이 틀리면 Code.gs 상수 NOTIFY_PHONE을 씁니다.
 * ============================================================ */
var SETTINGS_SHEET_NAME = '설정';
var SETTINGS_HEADERS = ['key', 'value'];

/** '설정' 탭을 가져옵니다. create가 true면 없으면 헤더와 함께 만듭니다. */
function getSettingsSheet_(create) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** '설정' 탭에서 key의 값을 읽습니다. 탭이나 key가 없으면 ''를 반환합니다. */
function getSetting_(key) {
  var sheet = getSettingsSheet_(false);
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var rows = sheet.getRange(2, 1, lastRow - 1, SETTINGS_HEADERS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === key) return String(rows[i][1] || '').trim();
  }
  return '';
}

/** '설정' 탭에 key/value를 저장합니다. 있으면 덮어쓰고 없으면 추가합니다. */
function setSetting_(key, value) {
  var sheet = getSettingsSheet_(true);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, SETTINGS_HEADERS.length).getDisplayValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }
  sheet.appendRow([key, value]);
}

/** 주문 알림을 받는 번호 (국내 010... 형식). '설정' 탭에 저장된 값이
 *  있고 형식이 맞으면 그걸 쓰고, 없거나 틀리면 상수 NOTIFY_PHONE을 씁니다. */
function getNotifyPhone_() {
  var saved = normalizeMobileDigits_(getSetting_('NOTIFY_PHONE'));
  if (saved && isValidMobileDigits_(saved)) return saved;
  return NOTIFY_PHONE;
}

/* ============================================================
 *  입금 계좌 정보 (은행명·계좌번호·예금주) — 1단계 손님 문자와
 *  홈페이지 결제 안내의 공통 진실 공급원
 *  - '설정' 탭에 key BANK_NAME / BANK_ACCOUNT / BANK_HOLDER 로 저장합니다.
 *  - 3개가 다 있어야 유효합니다. 하나라도 비면 null을 반환하고,
 *    홈페이지와 1단계 손님 문자는 자리표 동작으로 떨어집니다.
 * ============================================================ */

/** '설정' 탭에서 입금 계좌 3종을 읽습니다. 하나라도 비면 null을 반환합니다. */
function getBankInfo_() {
  var bank = String(getSetting_('BANK_NAME') || '').trim();
  var account = String(getSetting_('BANK_ACCOUNT') || '').trim();
  var holder = String(getSetting_('BANK_HOLDER') || '').trim();
  if (!bank || !account || !holder) return null;
  return { bank: bank, account: account, holder: holder };
}

/** 입금 계좌 공개 조회 (D1, 인증 없음) — 홈페이지 결제 안내용.
 *  계좌 3종이 다 있으면 {ok:true, bank, account, holder}를,
 *  아니면 {ok:false}를 반환합니다. */
function bankInfoGet() {
  try {
    var info = getBankInfo_();
    if (!info) return respond({ ok: false, error: '계좌 정보가 아직 없습니다.' });
    return respond({ ok: true, bank: info.bank, account: info.account, holder: info.holder });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 입금 계좌 조회 (D2, checkAdmin) — 관리자 표시용.
 *  반환: {ok, bank, account, holder, saved} */
function getBankInfo(data) {
  try {
    checkAdmin(data && data.key);
    var info = getBankInfo_();
    return respond({
      ok: true,
      bank: info ? info.bank : '',
      account: info ? info.account : '',
      holder: info ? info.holder : '',
      saved: !!info
    });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 입금 계좌 저장 (D2, checkAdmin)
 * body: { action: 'setBankInfo', key: 관리자 키, bank, account, holder }
 * 계좌번호는 숫자와 하이픈(-)만 허용합니다. 3개 모두 비어 있지 않아야 합니다.
 * 반환: {ok, bank, account, holder}
 */
function setBankInfo(data) {
  try {
    checkAdmin(data && data.key);
    var bank = String((data && data.bank) || '').trim();
    var account = String((data && data.account) || '').trim();
    var holder = String((data && data.holder) || '').trim();
    if (!bank) return respond({ ok: false, error: '은행명을 입력하세요.' });
    if (!account) return respond({ ok: false, error: '계좌번호를 입력하세요.' });
    if (!/^[0-9-]+$/.test(account)) {
      return respond({ ok: false, error: '계좌번호는 숫자와 하이픈(-)만 입력하세요.' });
    }
    if (!holder) return respond({ ok: false, error: '예금주를 입력하세요.' });
    setSetting_('BANK_NAME', bank);
    setSetting_('BANK_ACCOUNT', account);
    setSetting_('BANK_HOLDER', holder);
    return respond({ ok: true, bank: bank, account: account, holder: holder });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  전화번호 인증 (SMS OTP) — 주문자 전화가 본인 것인지 확인합니다.
 *  - 켜짐/꺼짐: '설정' 탭 PHONE_VERIFY_ENABLED ('TRUE'/'FALSE').
 *    기본값은 꺼짐 (없거나 'FALSE'면 비활성화 — 기존 주문 흐름 유지).
 *  - 인증코드 탭 '인증코드': [전화번호, 인증코드, 토큰, 생성일시, 만료일시,
 *    시도횟수, 인증완료, 사용여부]. 전화번호·인증코드·토큰 열은 텍스트 형식.
 *  - 인증번호: 6자리, 유효 5분. 확인 성공 시 20자 토큰 발급, 토큰 유효 30분.
 *  - 속도 제한 (공개 엔드포인트라 남용 방지, 필수):
 *    전화번호당 시간당 3번, 전체 시간당 50번, 코드당 확인 시도 5번까지.
 *  - 토큰은 1회용 — 주문 저장 전 사용여부를 TRUE로 표시합니다.
 *  - 인증 문자는 '문자발송기록' 탭에 구분 '인증'으로 남깁니다.
 *  - 검증 대상은 주문자 전화(ordererPhone)만입니다. 받는 분 전화는 인증 안 합니다.
 * ============================================================ */
/** 인증코드 탭 (열: 전화번호, 인증코드, 토큰, 생성일시, 만료일시, 시도횟수, 인증완료, 사용여부) */
var PHONE_VERIFY_SHEET_NAME = '인증코드';
var PHONE_VERIFY_HEADERS = ['전화번호', '인증코드', '토큰', '생성일시', '만료일시', '시도횟수', '인증완료', '사용여부'];
/** 인증번호 유효 시간 (분). */
var PHONE_VERIFY_CODE_TTL_MIN = 5;
/** 확인 성공 뒤 토큰 유효 시간 (분). */
var PHONE_VERIFY_TOKEN_TTL_MIN = 30;
/** 전화번호당 시간당 인증번호 요청 상한. */
var PHONE_VERIFY_PER_PHONE_HOURLY = 3;
/** 전체(모든 번호 합산) 시간당 인증번호 요청 상한. */
var PHONE_VERIFY_GLOBAL_HOURLY = 50;
/** 코드당 확인 시도 상한 (초과 시 코드 무효, 새로 받아야 함). */
var PHONE_VERIFY_MAX_ATTEMPTS = 5;
/** 속도 제한을 셀 때 최근 몇 행까지만 읽을지 (시간당 상한 50건이라 200행이면 충분). */
var PHONE_VERIFY_RECENT_ROWS = 200;

/** '인증코드' 탭을 가져옵니다. 없으면 헤더와 함께 만듭니다. */
function getPhoneVerifySheet_(create) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PHONE_VERIFY_SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(PHONE_VERIFY_SHEET_NAME);
    sheet.getRange(1, 1, 1, PHONE_VERIFY_HEADERS.length).setValues([PHONE_VERIFY_HEADERS]);
    sheet.setFrozenRows(1);
    // 전화번호·인증코드·토큰 열(A:C)은 텍스트 형식으로 — 앞자리 0이
    // 숫자로 바뀌어 사라지지 않게, 만들 때 미리 잡습니다.
    sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), 3).setNumberFormat('@');
  }
  return sheet;
}

/** 전화번호 인증이 켜져 있는지 — '설정' 탭 PHONE_VERIFY_ENABLED가
 *  'TRUE'일 때만 켜짐. 없거나 'FALSE'면 꺼짐 (기본값 꺼짐). */
function isPhoneVerifyEnabled_() {
  return String(getSetting_('PHONE_VERIFY_ENABLED') || '').trim().toUpperCase() === 'TRUE';
}

/** 'yyyy-MM-dd HH:mm:ss' 문자열을 Date로 풉니다. 형식이 틀리면 null. */
function parseStamp_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

/** 6자리 인증번호를 만듭니다 (100000~999999). */
function generatePhoneVerifyCode_() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** 20자 영숫자 토큰을 만듭니다 (헷갈리는 문자 제외). */
function generatePhoneVerifyToken_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var out = '';
  for (var i = 0; i < 20; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** 최근 1시간의 인증번호 요청 건수를 셉니다 (해당 번호 + 전체).
 *  시트 끝에서 최근 행만 읽습니다 — 시간당 상한이 50건이라 200행이면 충분합니다. */
function countRecentPhoneVerifyRequests_(sheet, phone, now) {
  var perPhone = 0;
  var global = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { perPhone: 0, global: 0 };
  var take = Math.min(lastRow - 1, PHONE_VERIFY_RECENT_ROWS);
  var rows = sheet.getRange(lastRow - take + 1, 1, take, PHONE_VERIFY_HEADERS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var created = parseStamp_(rows[i][3]);
    if (!created) continue;
    if (now.getTime() - created.getTime() > 3600000) continue;
    global++;
    if (String(rows[i][0] || '').replace(/[^0-9]/g, '') === phone) perPhone++;
  }
  return { perPhone: perPhone, global: global };
}

/**
 * 인증번호 요청 (D1, 공개 — checkAdmin 없음).
 * body: { action: 'requestPhoneCode', phone }
 * 전화번호 형식 검증 → 시간당 3번(해당 번호)·50번(전체) 제한 →
 * 6자리 코드 생성·행 저장 → SMSGate로 발송 → '인증' 로그.
 * 성공 {ok:true}, 실패 {ok:false, error}. 절대 throw하지 않습니다.
 */
function requestPhoneCode(data) {
  try {
    var phone = normalizeMobileDigits_(data && data.phone);
    if (!isValidMobileDigits_(phone)) {
      return respond({ ok: false, error: '전화번호를 확인해 주세요.' });
    }
    var now = new Date();
    var code = generatePhoneVerifyCode_();
    var created = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var expires = Utilities.formatDate(new Date(now.getTime() + PHONE_VERIFY_CODE_TTL_MIN * 60000), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    // 속도 제한 검사와 행 저장은 락 안에서 — 동시에 두 요청이 들어와도
    // 상한을 넘기지 않게. 발송은 네트워크 호출이라 락 해제 뒤에 합니다.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getPhoneVerifySheet_(true);
      var counts = countRecentPhoneVerifyRequests_(sheet, phone, now);
      if (counts.perPhone >= PHONE_VERIFY_PER_PHONE_HOURLY) {
        return respond({ ok: false, error: '인증번호는 시간당 3번까지만 받을 수 있습니다.' });
      }
      if (counts.global >= PHONE_VERIFY_GLOBAL_HOURLY) {
        return respond({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
      }
      var targetRow = sheet.getLastRow() + 1;
      sheet.getRange(targetRow, 1, 1, 3).setNumberFormat('@');
      sheet.appendRow([phone, code, '', created, expires, 0, 'FALSE', 'FALSE']);
    } finally {
      lock.releaseLock();
    }
    var message = '[효돈농원] 인증번호는 ' + code + '입니다. 5분 안에 입력해 주세요.';
    var ok = false;
    try { ok = sendSmsViaSmsGate_(phone, message); } catch (e) { ok = false; }
    try {
      var logSheet = getSmsLogSheet_();
      logPromoSend_(logSheet, '인증', message, 1, ok ? 1 : 0, ok ? 0 : 1, ok ? [] : [phone]);
    } catch (logErr) {
      Logger.log('requestPhoneCode log failed: ' + logErr);
    }
    if (!ok) return respond({ ok: false, error: '문자 발송에 실패했습니다. 다시 시도해 주세요.' });
    return respond({ ok: true });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 인증번호 확인 (D1, 공개 — checkAdmin 없음).
 * body: { action: 'verifyPhoneCode', phone, code }
 * 해당 번호의 가장 최근 미확인·미만료 행을 찾습니다. 없으면
 * '인증번호를 먼저 받아주세요.' / 코드 불일치 시 시도횟수+1, 5회째
 * 실패면 '시도 횟수를 초과했습니다…' / 일치 시 토큰 생성·인증완료=TRUE·
 * 만료일시 지금+30분 → {ok:true, token}. 절대 throw하지 않습니다.
 */
function verifyPhoneCode(data) {
  try {
    var phone = normalizeMobileDigits_(data && data.phone);
    if (!isValidMobileDigits_(phone)) {
      return respond({ ok: false, error: '전화번호를 확인해 주세요.' });
    }
    var code = String((data && data.code) || '').replace(/[^0-9]/g, '');
    if (code.length !== 6) {
      return respond({ ok: false, error: '인증번호 6자리를 입력해 주세요.' });
    }
    var sheet = getPhoneVerifySheet_(false);
    if (!sheet || sheet.getLastRow() < 2) {
      return respond({ ok: false, error: '인증번호를 먼저 받아주세요.' });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var lastRow = sheet.getLastRow();
      var take = Math.min(lastRow - 1, PHONE_VERIFY_RECENT_ROWS);
      var rows = sheet.getRange(lastRow - take + 1, 1, take, PHONE_VERIFY_HEADERS.length).getDisplayValues();
      var now = new Date();
      var idx = -1;
      for (var i = rows.length - 1; i >= 0; i--) {
        var r = rows[i];
        if (String(r[0] || '').replace(/[^0-9]/g, '') !== phone) continue;
        if (String(r[6] || '').trim().toUpperCase() === 'TRUE') continue;
        var exp = parseStamp_(r[4]);
        if (!exp || exp.getTime() <= now.getTime()) continue;
        idx = i;
        break;
      }
      if (idx < 0) {
        return respond({ ok: false, error: '인증번호를 먼저 받아주세요.' });
      }
      var rowNum = lastRow - take + 1 + idx;
      var row = rows[idx];
      var attempts = Number(row[5] || 0) || 0;
      if (String(row[1] || '').replace(/[^0-9]/g, '') !== code) {
        attempts += 1;
        sheet.getRange(rowNum, 6).setValue(attempts);
        if (attempts >= PHONE_VERIFY_MAX_ATTEMPTS) {
          return respond({ ok: false, error: '시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.' });
        }
        return respond({ ok: false, error: '인증번호가 맞지 않습니다.' });
      }
      var token = generatePhoneVerifyToken_();
      var tokenExpires = Utilities.formatDate(new Date(now.getTime() + PHONE_VERIFY_TOKEN_TTL_MIN * 60000), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(rowNum, 3).setValue(token);
      sheet.getRange(rowNum, 5).setValue(tokenExpires);
      sheet.getRange(rowNum, 7).setValue('TRUE');
      return respond({ ok: true, token: token });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 전화번호 인증 켜짐 여부 공개 조회 (D1, 인증 없음) — 홈페이지용.
 *  {ok:true, enabled}를 반환합니다. */
function phoneVerifyStatus() {
  return respond({ ok: true, enabled: isPhoneVerifyEnabled_() });
}

/** 전화번호 인증 켜짐 여부 조회 (D2, checkAdmin) — 관리자 표시용. */
function getPhoneVerifyEnabled(data) {
  try {
    checkAdmin(data && data.key);
    return respond({ ok: true, enabled: isPhoneVerifyEnabled_() });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 전화번호 인증 켜기/끄기 (D2, checkAdmin)
 * body: { action: 'setPhoneVerifyEnabled', key: 관리자 키, enabled: boolean }
 */
function setPhoneVerifyEnabled(data) {
  try {
    checkAdmin(data && data.key);
    var enabled = !!(data && data.enabled);
    setSetting_('PHONE_VERIFY_ENABLED', enabled ? 'TRUE' : 'FALSE');
    return respond({ ok: true, enabled: enabled });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 주문 저장 전 토큰을 1회용으로 소모합니다. 유효한 토큰 행이 있으면
 * 사용여부를 TRUE로 표시하고 true를, 없으면 false를 반환합니다.
 * doPost가 아직 주문 락을 잡기 전에 호출되므로 여기서 짧게 락을 잡습니다.
 * 유효 조건: 토큰 일치, 전화번호가 주문자 전화와 일치, 인증완료=TRUE,
 * 사용여부=FALSE, 만료일시 > 지금.
 */
function consumePhoneVerifyToken_(phone, token) {
  try {
    if (!phone || !token) return false;
    var sheet = getPhoneVerifySheet_(false);
    if (!sheet || sheet.getLastRow() < 2) return false;
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var lastRow = sheet.getLastRow();
      var take = Math.min(lastRow - 1, PHONE_VERIFY_RECENT_ROWS);
      var rows = sheet.getRange(lastRow - take + 1, 1, take, PHONE_VERIFY_HEADERS.length).getDisplayValues();
      var now = new Date();
      for (var i = rows.length - 1; i >= 0; i--) {
        var r = rows[i];
        if (String(r[0] || '').replace(/[^0-9]/g, '') !== phone) continue;
        if (String(r[2] || '').trim() !== String(token).trim()) continue;
        if (String(r[6] || '').trim().toUpperCase() !== 'TRUE') continue;
        if (String(r[7] || '').trim().toUpperCase() === 'TRUE') continue;
        var exp = parseStamp_(r[4]);
        if (!exp || exp.getTime() <= now.getTime()) continue;
        sheet.getRange(lastRow - take + 1 + i, 8).setValue('TRUE');
        return true;
      }
      return false;
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('consumePhoneVerifyToken_ failed: ' + err);
    return false;
  }
}

/* ============================================================
 *  고객 문의 (비공개) — 2026-11-15
 *  - 손님은 홈페이지 문의 폼에서 이름·연락처·문의만 남깁니다 (목록은
 *    손님에게 보이지 않음). 답은 문자로 따로 받습니다.
 *  - '문의' 탭: 문의일시 | 이름 | 연락처 | 문의내용 | 답변 | 답변일시 | 상태.
 *  - submitInquiry (D1 공개): 속도 제한 — 같은 전화로 60분 내 3건.
 *    저장 뒤 사장님 알림 문자 (구분 '문의알림', notifyNewOrder_ 패턴).
 *  - listInquiries / replyInquiry (D2, checkAdmin): 목록(최신순)·답변.
 *    답변은 손님 전화로 문자 발송 (구분 '고객알림', notifyCustomer_ 패턴).
 *    문자 실패해도 행 저장은 유지합니다.
 * ============================================================ */
var INQUIRY_SHEET_NAME = '문의';
var INQUIRY_HEADERS = ['문의일시', '이름', '연락처', '문의내용', '답변', '답변일시', '상태'];
/** 같은 전화로 60분 안에 접수할 수 있는 최대 문의 건수. */
var INQUIRY_PER_PHONE_HOURLY = 3;
/** 문의·답변 최대 글자 수. */
var INQUIRY_MESSAGE_MAX = 500;
/** 속도 제한 검사 때 시트 끝에서 읽는 최대 행 수. */
var INQUIRY_RECENT_ROWS = 200;

function getInquirySheet_(create) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(INQUIRY_SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(INQUIRY_SHEET_NAME);
    sheet.getRange(1, 1, 1, INQUIRY_HEADERS.length).setValues([INQUIRY_HEADERS]);
    sheet.setFrozenRows(1);
    // 연락처(C)·문의내용(D) 열은 텍스트 형식으로 — 앞자리 0(연락처)과
    // '=·+·-·@'로 시작하는 문장(문의내용)이 숫자·수식으로 바뀌지 않게,
    // 만들 때 미리 잡습니다.
    sheet.getRange(2, 3, Math.max(1, sheet.getMaxRows() - 1), 2).setNumberFormat('@');
  }
  return sheet;
}

/** 최근 60분의 해당 번호 문의 건수를 셉니다 (속도 제한용).
 *  시트 끝에서 최근 행만 읽습니다 — 시간당 상한이 3건이라 200행이면 충분합니다. */
function countRecentInquiriesByPhone_(sheet, phone, now) {
  var count = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var take = Math.min(lastRow - 1, INQUIRY_RECENT_ROWS);
  var rows = sheet.getRange(lastRow - take + 1, 1, take, INQUIRY_HEADERS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var created = parseStamp_(rows[i][0]);
    if (!created) continue;
    if (now.getTime() - created.getTime() > 3600000) continue;
    if (String(rows[i][2] || '').replace(/[^0-9]/g, '') === phone) count++;
  }
  return count;
}

/**
 * 새 문의가 들어오면 농원에 문자 1건을 보냅니다.
 * 메시지 예시:
 *   [효돈농원] 새 문의: 홍길동 010-1234-5678 — 귤이 언제쯤…
 * 실패해도 문의 접수는 절대 막지 않습니다 (내부 try/catch).
 * 보낸 결과는 '문자발송기록' 탭에 구분 '문의알림'으로 남겨 관리자 페이지의
 * 문자 전송 모니터링에 표시합니다. 홍보 하루 한도 계산(countTodaySent_은
 * '홍보'만 합산)에는 들어가지 않습니다.
 */
function notifyNewInquiry_(name, phone, message) {
  try {
    if (!SMSGATE_USERNAME || !SMSGATE_PASSWORD) return;
    var preview = String(message || '');
    if (preview.length > 30) preview = preview.slice(0, 30) + '…';
    var text = '[효돈농원] 새 문의: ' + name + ' ' + phone + ' — ' + preview;
    var notifyPhone = getNotifyPhone_();
    var ok = false;
    try { ok = sendSmsViaSmsGate_(notifyPhone, text); } catch (e) { ok = false; }
    try {
      var logSheet = getSmsLogSheet_();
      logPromoSend_(logSheet, '문의알림', text, 1, ok ? 1 : 0, ok ? 0 : 1, ok ? [] : [notifyPhone]);
    } catch (logErr) {
      Logger.log('notifyNewInquiry_ log failed: ' + logErr);
    }
  } catch (err) {
    Logger.log('notifyNewInquiry_ failed: ' + err);
  }
}

/**
 * 고객 문의 접수 (D1, 공개 — checkAdmin 없음).
 * body: { action: 'submitInquiry', name, phone, message }
 * 이름 1~20자 · 전화 한국 휴대폰 10~11자리 · 문의 1~500자 검증 →
 * 같은 전화 60분 내 3건 제한 → 행 저장 → 사장님 알림 문자.
 * 성공 {ok:true}, 실패 {ok:false, error}. 절대 throw하지 않습니다.
 */
function submitInquiry(data) {
  try {
    var name = String((data && data.name) || '').trim();
    if (!name || name.length > 20) {
      return respond({ ok: false, error: '이름을 1~20자로 입력해 주세요.' });
    }
    var phone = normalizeMobileDigits_(data && data.phone);
    if (!isValidMobileDigits_(phone)) {
      return respond({ ok: false, error: '연락 가능한 휴대폰 번호를 정확히 입력해 주세요.' });
    }
    var message = String((data && data.message) || '').trim();
    if (!message || message.length > INQUIRY_MESSAGE_MAX) {
      return respond({ ok: false, error: '문의 내용을 1~500자로 입력해 주세요.' });
    }
    var now = new Date();
    var stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    // 속도 제한 검사와 행 저장은 락 안에서 — 동시에 두 문의가 들어와도
    // 상한을 넘기지 않게. 알림 문자는 락 해제 뒤에 보냅니다.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getInquirySheet_(true);
      var recent = countRecentInquiriesByPhone_(sheet, phone, now);
      if (recent >= INQUIRY_PER_PHONE_HOURLY) {
        return respond({ ok: false, error: '문의는 시간당 3건까지만 접수할 수 있습니다. 잠시 후 다시 남겨주세요.' });
      }
      var targetRow = sheet.getLastRow() + 1;
      sheet.getRange(targetRow, 3, 1, 2).setNumberFormat('@');
      sheet.appendRow([stamp, safe(name), phone, safe(message), '', '', '대기']);
    } finally {
      lock.releaseLock();
    }
    notifyNewInquiry_(name, phone, message);
    return respond({ ok: true });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 고객 문의 목록 조회 (D2, checkAdmin — GET/POST 공용).
 * data: { key: 관리자 키 }. 최신순으로 돌려줍니다.
 * 반환: {ok:true, inquiries:[{row, datetime, name, phone, message, reply, repliedAt, status}]}.
 */
function listInquiries(data) {
  try {
    checkAdmin(data && data.key);
    var sheet = getInquirySheet_(false);
    if (!sheet || sheet.getLastRow() < 2) return respond({ ok: true, inquiries: [] });
    var lastRow = sheet.getLastRow();
    var rows = sheet.getRange(2, 1, lastRow - 1, INQUIRY_HEADERS.length).getDisplayValues();
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        row: i + 2,
        datetime: String(r[0] || ''),
        name: String(r[1] || ''),
        phone: String(r[2] || ''),
        message: String(r[3] || ''),
        reply: String(r[4] || ''),
        repliedAt: String(r[5] || ''),
        status: String(r[6] || '') === '답변완료' ? '답변완료' : '대기'
      });
    }
    out.reverse();
    return respond({ ok: true, inquiries: out });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 고객 문의 답변 (D2, checkAdmin).
 * body: { action: 'replyInquiry', key: 관리자 키, row, reply }
 * reply 1~500자. 해당 행에 답변·답변일시·상태='답변완료'를 저장하고
 * (락 안에서), 락 해제 뒤 손님 전화로 답변 문자를 보냅니다.
 * 메시지: "[효돈농원] 문의 답변: {답변}".
 * 문자 실패해도 행 저장은 유지합니다. 반환 {ok:true, smsOk}.
 * 재답변 가능 — 답변을 고치면 다시 저장하고 다시 발송합니다.
 */
function replyInquiry(data) {
  try {
    checkAdmin(data && data.key);
    var reply = String((data && data.reply) || '').trim();
    if (!reply || reply.length > INQUIRY_MESSAGE_MAX) {
      return respond({ ok: false, error: '답변을 1~500자로 입력해 주세요.' });
    }
    var row = Number(data && data.row);
    if (!isFinite(row) || row !== Math.floor(row) || row < 2) {
      return respond({ ok: false, error: '문의 행을 찾을 수 없습니다.' });
    }
    var sheet = getInquirySheet_(false);
    if (!sheet || row > sheet.getLastRow()) {
      return respond({ ok: false, error: '문의 행을 찾을 수 없습니다.' });
    }
    var now = new Date();
    var stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var phone = '';
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      phone = String(sheet.getRange(row, 3).getDisplayValue() || '').replace(/[^0-9]/g, '');
      if (!isValidMobileDigits_(phone)) {
        return respond({ ok: false, error: '문의하신 분의 연락처가 올바르지 않습니다.' });
      }
      sheet.getRange(row, 5).setValue(safe(reply));
      sheet.getRange(row, 6).setValue(stamp);
      sheet.getRange(row, 7).setValue('답변완료');
    } finally {
      lock.releaseLock();
    }
    // 답변 문자는 손님에게 가는 알림이라 구분 '고객알림'으로 기록합니다.
    // 실패해도 저장된 답변은 그대로 두고, 발송 결과만 돌려줍니다.
    var smsOk = notifyCustomer_(phone, '[효돈농원] 문의 답변: ' + reply);
    return respond({ ok: true, smsOk: !!smsOk });
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

/** 번호에서 숫자만 남기고, +82(82...)로 시작하면 국내 형식(0...)으로 바꿉니다.
 *  앞자리 0이 소실된 번호도 복원합니다 ('010...'이 10자리 '10...'으로 저장된 경우).
 *  10자리 국내 휴대폰은 없으므로 10으로 시작하는 10자리는 010 번호가 0을 잃은
 *  것으로 보고 0을 붙이고, 011/016/017/018/019 번호가 0을 잃은 9자리도 복원합니다.
 *  순수 함수입니다. */
function normalizeMobileDigits_(raw) {
  var d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.indexOf('82') === 0 && d.length >= 11 && d.length <= 13) {
    var rest = d.substring(2);
    if (/^(10|11|16|17|18|19)/.test(rest)) return '0' + rest;
  }
  if (d.length === 10 && d.indexOf('10') === 0) return '0' + d;
  if (d.length === 9 && /^(11|16|17|18|19)/.test(d)) return '0' + d;
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
 * N-E-P2-3: 큐 행들에서 오늘 처리시작한 '기록실패' 건수를 셉니다.
 * '기록실패'는 발송은 됐는데 로그 쓰기가 끝내 안 된 행이라 '문자발송기록'
 * 행이 없어 로그 기반 하루 한도(countTodaySent_)에서 빠졌습니다. 발송일시
 * (6열)는 기록 실패 시 안 남으므로, 배치에서 뽑힐 때 찍히는 처리시작
 * (5열, yyyy-MM-dd HH:mm:ss)의 날짜로 오늘 것인지 봅니다. 순수 함수입니다.
 */
function countQueueRecordFailed_(rows, today) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || [];
    if (String(r[3] || '') === '기록실패' && String(r[4] || '').substring(0, 10) === today) n++;
  }
  return n;
}

/**
 * 큐 배치 1회분을 1건씩 순차 발송합니다.
 * sendFn(phone, message)는 성공 시 true, 실패 시 false를 반환합니다.
 * 건마다 sleepFn(대기 시간)을 부릅니다 — 마지막 건 뒤에는 쉬지 않습니다
 * (대기 시간이 4건에 240초가 돼 6분 실행 제한에 다가가는 것을 막습니다).
 * onSent(item, result)가 있으면 건마다 발송 직후 바로 부릅니다
 * (호출자가 상태·발송일시·로그를 즉시 기록하게 — 배치 끝까지 미루면
 *  중간에 타임아웃 날 때 이미 보낸 건이 '발송중'으로 남아 중복 발송됨).
 * 순수 함수입니다 (sendFn/sleepFn/onSent를 주입받습니다).
 * 반환: [{phone, message, ok, error}] (보낸 순서 그대로)
 */
function sendPromoBatch_(batch, sendFn, sleepFn, onSent) {
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
    var res = { phone: item.phone, message: item.message, ok: ok, error: errText };
    results.push(res);
    // 건마다 발송 직후 즉시 기록합니다 (다음 건을 보내기 전, 대기 전).
    // N-P1-10: 기록(onSent)이 실패했는지 결과에 남깁니다 (recorded).
    // onSent가 던져도 발송 자체는 된 것이니, 기록 실패는 호출자가
    // 따로 복구해야 합니다 — 조용히 넘기면 '발송중'으로 남아 15분 뒤
    // 다시 보내집니다.
    var recorded = true;
    var recordError = '';
    if (onSent) {
      try { onSent(item, res); } catch (e) {
        recorded = false;
        recordError = String(e);
        Logger.log('sendPromoBatch_ onSent failed: ' + e);
      }
    }
    res.recorded = recorded;
    res.recordError = recordError;
    // 마지막 건 뒤에는 쉬지 않습니다.
    if (sleepFn && i < batch.length - 1) sleepFn(PROMO_QUEUE_SEND_DELAY_MS);
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
/**
 * 오늘(KST) '홍보' 발송 성공 건수. 로그 행 + '기록실패' 큐 행을 합산합니다.
 * queueRows를 주면 N-E-P2-3에 따라 오늘 처리시작한 '기록실패' 행도
 * 1건씩 더합니다 (발송은 됐는데 로그가 없어 한도에서 빠지는 것을 막습니다).
 * 생략하면 기존처럼 로그만 셉니다.
 */
function readTodaySent_(logSheet, today, queueRows) {
  var n = 0;
  var lastRow = logSheet.getLastRow();
  if (lastRow >= 2) {
    var rows = logSheet.getRange(2, 1, lastRow - 1, SMS_LOG_HEADERS.length).getDisplayValues();
    n = countTodaySent_(rows, today);
  }
  if (queueRows) n += countQueueRecordFailed_(queueRows, today);
  return n;
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
    // 수신거부된 번호는 방어적으로 제외합니다 ('홍보수신자' 탭).
    var optedOut = getOptedOutPhones_();
    var filteredOptOut = 0;
    if (optedOut.length) {
      var keptNumbers = [];
      for (var ni = 0; ni < numbers.length; ni++) {
        if (optedOut.indexOf(e164ToDomestic_(numbers[ni])) >= 0) { filteredOptOut++; continue; }
        keptNumbers.push(numbers[ni]);
      }
      numbers = keptNumbers;
    }
    if (!numbers.length) {
      return respond({ ok: false, error: '선택한 번호가 모두 수신거부 상태라 예약할 번호가 없습니다. 수신자 목록에서 수신거부를 해제하세요.' });
    }
    if (numbers.length > PROMO_QUEUE_MAX) {
      return respond({ ok: false, error: '한 번에 예약할 수 있는 건수는 최대 ' + PROMO_QUEUE_MAX + '건입니다. (' + numbers.length + '건 입력됨)' });
    }
    var finalMessage = buildPromoMessage_(message);
    var sheet = getPromoQueueSheet_();
    var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var pendingAfter = 0;
    var duplicates = 0;
    var kept = numbers.length;
    try {
      var lastRow = sheet.getLastRow();
      var rows = [];
      if (lastRow >= 2) {
        rows = sheet.getRange(2, 1, lastRow - 1, SMS_QUEUE_HEADERS.length).getDisplayValues();
        pendingAfter += countQueueStatus_(rows, '대기');
      }
      // N-P1-1 (gstack 오디트 2026-11-15): 큐에 이미 '대기'·'발송중'인 번호는
      // 다시 예약하지 않습니다 — 같은 번호를 두 번 예약하면 15분 뒤 같은
      // 문자를 두 번 받습니다. 락 안에서 읽은 큐와 대조하므로, 동시에
      // 들어온 두 예약이 서로를 못 보는 일도 없습니다. 저장값이 앞자리 0을
      // 잃은 10자리여도 정규화(normalizeMobileDigits_)로 비교합니다.
      var pendingNumbers = {};
      for (var ri = 0; ri < rows.length; ri++) {
        var st = String(rows[ri][3] || '').trim();
        if (st === '대기' || st === '발송중') {
          pendingNumbers[normalizeMobileDigits_(String(rows[ri][1] || ''))] = true;
        }
      }
      var rowsToAdd = [];
      for (var i = 0; i < numbers.length; i++) {
        var domestic = e164ToDomestic_(numbers[i]);
        if (pendingNumbers[normalizeMobileDigits_(domestic)]) { duplicates++; continue; }
        rowsToAdd.push([stamp, domestic, finalMessage, '대기', '', '', '']);
      }
      kept = rowsToAdd.length;
      pendingAfter += kept;
      if (rowsToAdd.length) {
        // 한 번에 묶어서 씁니다 (행마다 한 줄씩 쓰면 500건까지 100초 넘게 걸리고, 그 사이 고객 주문이 막힙니다).
        sheet.getRange(lastRow + 1, 1, rowsToAdd.length, SMS_QUEUE_HEADERS.length).setValues(rowsToAdd);
      }
    } finally {
      lock.releaseLock();
    }
    if (!kept) {
      return respond({ ok: false, error: '입력한 번호가 모두 이미 예약되어 있습니다. (대기·발송중)' });
    }
    return respond({
      ok: true,
      queued: kept,
      message: finalMessage,
      estimatedDays: estimatePromoDays_(pendingAfter, PROMO_DAILY_LIMIT),
      pending: pendingAfter,
      filteredOptOut: filteredOptOut,
      duplicates: duplicates
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
    // 수신거부된 번호는 테스트 발송도 하지 않습니다.
    var optedOutTest = getOptedOutPhones_();
    if (optedOutTest.indexOf(e164ToDomestic_(numbers[0])) >= 0) {
      return respond({ ok: false, error: '이 번호는 수신거부 상태라 보낼 수 없습니다. 수신자 목록에서 수신거부를 해제하세요.' });
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
 * 건 사이에만 60초 쉽니다 (마지막 건 뒤에는 안 쉬어 약 190초라
 * 6분 실행 제한 안에 듭니다).
 * 하루 상한 100건(오늘 성공 합산)은 '문자발송기록' 탭으로 계산하고,
 * 남은 한도까지만 보냅니다.
 * 순서: ① 복구(15분 넘게 '발송중'인 행을 '대기'로) — 한도 소진일에도
 * 먼저 수행합니다. ② 한도 검사. ③ 보낼 배치 확보('발송중' 표시).
 * ④ 건마다 발송 직후 즉시 '발송완료'/'실패' + 발송일시 + 로그를
 * 기록합니다 (배치 끝까지 미루면 중간 타임아웃 시 이미 보낸 건이
 * '발송중'으로 남아 15분 뒤 다시 보내져 고객이 중복 수신합니다).
 * 동시에 두 번 실행되지 않게 ①~③ 구간만 짧게 잠급니다.
 */
function processPromoQueue_() {
  var queueSheet = getPromoQueueSheet_();
  var logSheet = getSmsLogSheet_();
  var now = new Date();
  var today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  var stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
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
    // 1) 복구 먼저 — 한도 소진일에도 15분 넘게 '발송중'인 행은
    // '대기'로 되돌립니다 (중단된 실행의 흔적).
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
    // 2) 한도 검사 (복구 뒤에 — 복구된 행은 다시 보낼 수 있게).
    // N-E-P2-3: '기록실패' 행도 한도에 더합니다 (qRows를 넘깁니다).
    var todaySent = readTodaySent_(logSheet, today, qRows);
    var remaining = PROMO_DAILY_LIMIT - todaySent;
    if (remaining <= 0) {
      Logger.log('processPromoQueue_: 오늘 하루 한도(100건)를 모두 사용했습니다.');
      return;
    }
    // 3) 보낼 배치 확보 ('대기' 행을 '발송중'으로 표시).
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

  // 4) 건마다 발송 직후 즉시 상태·발송일시·로그를 기록합니다.
  // N-P1-10: 기록이 실패하면 최대 3번까지 다시 시도합니다 (짧게 쉬면서).
  // 그래도 안 되면 종단 상태 '기록실패'로 남깁니다 — '발송중'으로 두면
  // 15분 뒤 복구가 '대기'로 되돌려 이미 보낸 문자를 다시 보내게 됩니다.
  // '기록실패'는 다시 보내지 않으므로 중복 발송이 없습니다. 발송 자체가
  // 실패한 건(res.ok=false)은 '실패'로 남겨 다시 보내기 대상이 되게 합니다.
  // 상태 쓰기(setValue)는 멱등이라 재시도가 안전하고, 발송 기록
  // (appendRow)은 멱등이 아니라 상태 기록이 된 뒤 한 번만 시도합니다.
  sendPromoBatch_(batch, sendSmsViaSmsGate_, function (ms) { Utilities.sleep(ms); }, function (item, res) {
    var sentStamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var status = res.ok ? '발송완료' : '실패';
    var statusOk = false;
    var lastErr = '';
    for (var attempt = 0; attempt < 3 && !statusOk; attempt++) {
      try {
        queueSheet.getRange(item.row, 4).setValue(status);
        queueSheet.getRange(item.row, 6).setValue(sentStamp);
        if (!res.ok) queueSheet.getRange(item.row, 7).setValue(res.error || '발송 실패');
        statusOk = true;
      } catch (e) {
        lastErr = String(e);
        if (attempt < 2) Utilities.sleep(2000);
      }
    }
    if (statusOk) {
      try {
        logPromoSend_(logSheet, '홍보', item.message, 1, res.ok ? 1 : 0, res.ok ? 0 : 1, res.ok ? [] : [item.phone]);
      } catch (e) {
        Logger.log('processPromoQueue_ log failed for row ' + item.row + ': ' + e);
      }
      return;
    }
    // 상태조차 기록이 안 됐습니다. '발송중'으로 두지 말고 종단 상태로 남깁니다.
    try {
      queueSheet.getRange(item.row, 4).setValue(res.ok ? '기록실패' : '실패');
      queueSheet.getRange(item.row, 7).setValue('기록 실패: ' + lastErr);
    } catch (e2) {
      Logger.log('processPromoQueue_ record failed for row ' + item.row + ': ' + lastErr + ' / ' + e2);
    }
  });
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
 * 반환: {ok, queue: {waiting, sending, done, failed, recordFailed},
 *         todaySent, limit, triggerInstalled, recent: [최신 10건],
 *         items: [큐 항목 — '대기'·'발송중'·'실패'·'기록실패', 오래된 순 최대 100건]}
 * 최근 기록: [{date, kind, message, total, sent, failed, failedNumbers}]
 * 큐 항목: [{row, reservedAt, phone, message, status, startedAt, sentAt, error}]
 * (row는 큐 시트 행 번호(1부터)로, updatePromo·cancelPromo에 그대로 씁니다)
 */
function getPromoStatus(data) {
  try {
    checkAdmin(data && data.key);
    var queueSheet = getPromoQueueSheet_();
    var logSheet = getSmsLogSheet_();
    var queue = { waiting: 0, sending: 0, done: 0, failed: 0, recordFailed: 0 };
    var items = [];
    var qLast = queueSheet.getLastRow();
    if (qLast >= 2) {
      var qRows = queueSheet.getRange(2, 1, qLast - 1, SMS_QUEUE_HEADERS.length).getDisplayValues();
      queue.waiting = countQueueStatus_(qRows, '대기');
      queue.sending = countQueueStatus_(qRows, '발송중');
      queue.done = countQueueStatus_(qRows, '발송완료');
      queue.failed = countQueueStatus_(qRows, '실패');
      // N-P1-10: '기록실패'는 발송은 됐는데 기록이 끝내 안 된 행입니다.
      queue.recordFailed = countQueueStatus_(qRows, '기록실패');
      // 편집·모니터링용 큐 항목: '대기'·'발송중'·'실패'·'기록실패'를
      // 오래된 순으로 최대 100건. '실패'를 포함해야 SmsMonitor의
      // 다시 보내기 버튼이 뜹니다 (N-P1-3). 발송완료·취소는 최근 발송
      // 기록(recent)에 남습니다.
      for (var qi = 0; qi < qRows.length && items.length < 100; qi++) {
        var qs = String((qRows[qi] || [])[3] || '');
        if (qs !== '대기' && qs !== '발송중' && qs !== '실패' && qs !== '기록실패') continue;
        items.push({
          row: qi + 2,
          reservedAt: String(qRows[qi][0] || ''),
          phone: String(qRows[qi][1] || ''),
          message: String(qRows[qi][2] || ''),
          status: qs,
          startedAt: String(qRows[qi][4] || ''),
          sentAt: String(qRows[qi][5] || ''),
          error: String(qRows[qi][6] || '')
        });
      }
    }
    var today = todayKst_();
    // N-E-P2-3: '기록실패' 행도 한도에 더합니다 (qRows를 넘깁니다).
    var todaySent = readTodaySent_(logSheet, today, qRows);
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
      recent,
      items
    });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 주문 알림 받는 번호 조회 (관리자 전용, 배포 2)
 * 반환: {ok, phone: 현재 적용되는 번호, saved: 저장된 값이 있는지,
 *        defaultPhone: 상수 기본값(NOTIFY_PHONE)}
 */
function getNotifyPhone(data) {
  try {
    checkAdmin(data && data.key);
    var saved = normalizeMobileDigits_(getSetting_('NOTIFY_PHONE'));
    var hasSaved = !!saved && isValidMobileDigits_(saved);
    return respond({
      ok: true,
      phone: hasSaved ? saved : NOTIFY_PHONE,
      saved: hasSaved,
      defaultPhone: NOTIFY_PHONE
    });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 주문 알림 받는 번호 저장 (관리자 전용, 배포 2)
 * body: { action: 'setNotifyPhone', key: 관리자 키, phone: '010-...' }
 * 형식이 맞으면 '설정' 탭에 key 'NOTIFY_PHONE'으로 저장합니다. 이후
 * 주문 알림(notifyNewOrder_)과 테스트(testSmsGate)는 저장된 번호로 보냅니다.
 * 반환: {ok, phone: 저장된 번호}
 */
function setNotifyPhone(data) {
  try {
    checkAdmin(data && data.key);
    var phone = normalizeMobileDigits_((data && data.phone) || '');
    if (!isValidMobileDigits_(phone)) {
      return respond({ ok: false, error: '유효한 휴대폰 번호가 아닙니다. 010으로 시작하는 번호를 입력하세요.' });
    }
    setSetting_('NOTIFY_PHONE', phone);
    return respond({ ok: true, phone: phone });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보 예약 1건 편집 (관리자 전용, 배포 2) — 상태 '대기'인 행만 바꿀 수 있습니다.
 * body: { action: 'updatePromo', key: 관리자 키, row: 큐 시트 행 번호(1부터),
 *         message?: 새 문자, phone?: 새 번호 }
 * 큐 처리기(processPromoQueue_)가 같은 행을 '발송중'으로 바꾸는 것과 겹치지
 * 않게 잠금을 잡고 상태를 다시 확인한 뒤에만 씁니다. 문자는 저장할 때
 * buildPromoMessage_로 [효돈농원]·수신거부 안내를 다시 붙입니다.
 * 반환: {ok, row, phone, message}
 */
function updatePromo(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number((data && data.row) || 0);
    if (!row || row < 2) {
      return respond({ ok: false, error: '편집할 예약 행을 알 수 없습니다.' });
    }
    var hasMessage = data && typeof data.message === 'string';
    var hasPhone = data && typeof data.phone === 'string';
    if (!hasMessage && !hasPhone) {
      return respond({ ok: false, error: '바꿀 문자나 번호를 입력하세요.' });
    }
    var newMessage = '';
    if (hasMessage) {
      newMessage = String(data.message || '').trim();
      if (!newMessage) return respond({ ok: false, error: '보낼 문자를 입력하세요.' });
      if (newMessage.length > 2000) return respond({ ok: false, error: '문자는 2000자까지 보낼 수 있습니다.' });
      newMessage = buildPromoMessage_(newMessage);
    }
    var newPhone = '';
    if (hasPhone) {
      var numbers = parsePromoNumbers_([data.phone]);
      if (numbers.length !== 1) {
        return respond({ ok: false, error: '유효한 휴대폰 번호가 아닙니다. 010으로 시작하는 번호를 입력하세요.' });
      }
      newPhone = e164ToDomestic_(numbers[0]);
      // P1-5: 수신거부된 번호로는 예약을 바꿀 수 없습니다 ('홍보수신자' 탭).
      // reservePromo·sendPromoTest는 이미 걸러내는데 updatePromo만 빠져 있어
      // 거부된 번호를 예약 편집으로 다시 넣으면 발송됐습니다.
      if (getOptedOutPhones_().indexOf(newPhone) >= 0) {
        return respond({ ok: false, error: '수신거부된 번호입니다. 홍보 문자를 보낼 수 없습니다.' });
      }
    }
    var sheet = getPromoQueueSheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (row > sheet.getLastRow()) {
        return respond({ ok: false, error: '없는 예약 행입니다.' });
      }
      var status = String(sheet.getRange(row, 4).getDisplayValue() || '');
      if (status !== '대기') {
        return respond({ ok: false, error: '이미 발송 중이거나 발송된 예약은 편집할 수 없습니다. (상태: ' + status + ')' });
      }
      if (hasMessage) sheet.getRange(row, 3).setValue(newMessage);
      if (hasPhone) sheet.getRange(row, 2).setValue(newPhone);
      return respond({
        ok: true,
        row: row,
        phone: hasPhone ? newPhone : String(sheet.getRange(row, 2).getDisplayValue() || ''),
        message: hasMessage ? newMessage : String(sheet.getRange(row, 3).getDisplayValue() || '')
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보 예약 1건 취소 (관리자 전용, 배포 2) — 상태 '대기'인 행만 취소할 수 있습니다.
 * body: { action: 'cancelPromo', key: 관리자 키, row: 큐 시트 행 번호(1부터) }
 * 행을 지우지 않고 상태만 '취소'로 바꿉니다. 큐 처리기는 '대기'만 보내므로
 * 취소된 행은 더 이상 발송되지 않습니다.
 * 반환: {ok, row}
 */
function cancelPromo(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number((data && data.row) || 0);
    if (!row || row < 2) {
      return respond({ ok: false, error: '취소할 예약 행을 알 수 없습니다.' });
    }
    var sheet = getPromoQueueSheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (row > sheet.getLastRow()) {
        return respond({ ok: false, error: '없는 예약 행입니다.' });
      }
      var status = String(sheet.getRange(row, 4).getDisplayValue() || '');
      if (status !== '대기') {
        return respond({ ok: false, error: '이미 발송 중이거나 발송된 예약은 취소할 수 없습니다. (상태: ' + status + ')' });
      }
      sheet.getRange(row, 4).setValue('취소');
      return respond({ ok: true, row: row });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보 예약 1건 다시 보내기 (관리자 전용, 배포 2) — 상태 '실패'인 행만 '대기'로 되돌립니다.
 * body: { action: 'retryPromo', key: 관리자 키, row: 큐 시트 행 번호(1부터) }
 * '실패'는 발송 자체가 안 된 행이므로 다시 '대기'로 돌리면 15분 트리거가
 * 다시 보냅니다. 발송은 됐는데 기록만 실패한 '기록실패'(N-P1-10)는
 * 대상이 아닙니다 — 다시 보내면 고객이 같은 문자를 두 번 받습니다.
 * 락 안에서 상태를 다시 확인한 뒤에만 씁니다. 되돌릴 때 이전 시도의
 * 처리시작·오류 기록은 지워 깔끔한 '대기' 행으로 만듭니다.
 * 반환: {ok, row}
 */
function retryPromo(data) {
  try {
    checkAdmin(data && data.key);
    var row = Number((data && data.row) || 0);
    if (!row || row < 2) {
      return respond({ ok: false, error: '다시 보낼 예약 행을 알 수 없습니다.' });
    }
    var sheet = getPromoQueueSheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (row > sheet.getLastRow()) {
        return respond({ ok: false, error: '없는 예약 행입니다.' });
      }
      var status = String(sheet.getRange(row, 4).getDisplayValue() || '');
      if (status !== '실패') {
        return respond({ ok: false, error: '발송에 실패한 예약만 다시 보낼 수 있습니다. (상태: ' + status + ')' });
      }
      sheet.getRange(row, 4).setValue('대기');
      sheet.getRange(row, 5).setValue('');
      sheet.getRange(row, 6).setValue('');
      sheet.getRange(row, 7).setValue('');
      return respond({ ok: true, row: row });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/* ============================================================
 *  홍보문구 버전 저장 · 홍보수신자 목록
 *  - 홍보문구 버전: '홍보문구버전' 탭 [버전명, 문구, 생성일시]. 같은
 *    이름이면 덮어씁니다. 문구는 본문만 저장하고, 앞 [효돈농원]과
 *    뒤 수신거부 안내는 발송할 때(buildPromoMessage_) 자동으로 붙습니다.
 *  - 홍보수신자: '홍보수신자' 탭 [전화번호, 이름, 메모, 수신거부, 등록일].
 *    전화번호는 텍스트 형식('@')으로 저장해 앞자리 0이 안 사라지게 합니다.
 *    수신거부(TRUE)인 번호는 예약·테스트 발송에서 자동으로 걸러집니다
 *    (reservePromo·sendPromoTest가 방어적으로 제외합니다).
 *    listPromoRecipients는 '문자발송큐'에서 전화번호별 최근 발송을 찾아
 *    lastSend {date, ok}로 함께 돌려주고, 이름·메모는 updatePromoRecipient으로
 *    고칩니다 (전화번호는 키라서 고치지 않습니다).
 * ============================================================ */
var PROMO_VERSION_SHEET_NAME = '홍보문구버전';
var PROMO_VERSION_HEADERS = ['버전명', '문구', '생성일시'];
var PROMO_RECIPIENT_SHEET_NAME = '홍보수신자';
var PROMO_RECIPIENT_HEADERS = ['전화번호', '이름', '메모', '수신거부', '등록일'];

/** '홍보문구버전' 탭을 가져옵니다. create가 true면 없으면 헤더와 함께 만듭니다. */
function getPromoVersionSheet_(create) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PROMO_VERSION_SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(PROMO_VERSION_SHEET_NAME);
    sheet.getRange(1, 1, 1, PROMO_VERSION_HEADERS.length).setValues([PROMO_VERSION_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** '홍보수신자' 탭을 가져옵니다. create가 true면 없으면 헤더와 함께 만듭니다. */
function getPromoRecipientSheet_(create) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PROMO_RECIPIENT_SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(PROMO_RECIPIENT_SHEET_NAME);
    sheet.getRange(1, 1, 1, PROMO_RECIPIENT_HEADERS.length).setValues([PROMO_RECIPIENT_HEADERS]);
    sheet.setFrozenRows(1);
    // 전화번호 열(1열)은 텍스트 형식으로 둡니다 — 앞자리 0 유지.
    sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
  }
  return sheet;
}

/** 저장된 수신자 전화번호가 요청 번호와 같은지 확인합니다.
 *  저장값이 앞자리 0을 잃은 10자리('1080058173')여도 정규화 값
 *  ('01080058173')으로 비교하고, 숫자 그대로도 비교합니다. 순수 함수입니다. */
function promoRecipientPhoneMatches_(stored, requested) {
  var s = String(stored || '').replace(/[^0-9]/g, '');
  var r = String(requested || '').replace(/[^0-9]/g, '');
  if (!s || !r) return false;
  if (s === r) return true;
  return normalizeMobileDigits_(s) === normalizeMobileDigits_(r);
}

/** 수신자 한 줄('전화번호 이름' 또는 전화번호만)을 파싱합니다.
 *  탭·콤마·공백으로 나눕니다. 번호가 공백으로 끊겨 있으면 앞 토큰부터
 *  최대 3개까지 이어붙여 유효한 번호가 되면 확정하고, 나머지는 이름입니다.
 *  탭·콤마로 '전화번호,이름,메모' 3칸이면 메모까지 뽑습니다.
 *  반환: {phone: 국내 숫자, name: string, memo: string}. 형식이 틀리면 null. 순수 함수입니다. */
function parsePromoRecipientLine_(line) {
  var text = String(line || '').trim();
  if (!text) return null;
  var fields = text.split(/[\t,]+/);
  var phone = '';
  var name = '';
  var memo = '';
  if (fields.length >= 2) {
    phone = normalizeMobileDigits_(fields[0]);
    if (!isValidMobileDigits_(phone)) return null;
    name = fields[1].trim();
    memo = fields.slice(2).join(' ').trim();
  } else {
    var tokens = text.split(/\s+/);
    var found = false;
    for (var take = 1; take <= 3 && take <= tokens.length; take++) {
      var cand = normalizeMobileDigits_(tokens.slice(0, take).join(''));
      if (isValidMobileDigits_(cand)) {
        phone = cand;
        name = tokens.slice(take).join(' ').trim();
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return { phone: phone, name: name, memo: memo };
}

/** '홍보수신자' 탭에서 수신거부(TRUE)인 번호(국내 숫자) 목록을 읽습니다. 탭이 없으면 빈 배열. */
function getOptedOutPhones_() {
  var sheet = getPromoRecipientSheet_(false);
  var out = [];
  if (!sheet) return out;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_RECIPIENT_HEADERS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var flag = String(rows[i][3] || '').trim().toUpperCase();
    if (flag === 'TRUE' || flag === '1' || flag === 'Y') {
      var phone = normalizeMobileDigits_(rows[i][0]);
      if (isValidMobileDigits_(phone)) out.push(phone);
    }
  }
  return out;
}

/**
 * 홍보문구 버전 저장 (관리자 전용, 배포 2) — 같은 이름이면 덮어씁니다.
 * body: { action: 'savePromoVersion', key: 관리자 키, name: 버전명, message: 문구 본문 }
 * 반환: {ok, name, created}
 */
function savePromoVersion(data) {
  try {
    checkAdmin(data && data.key);
    var name = String((data && data.name) || '').trim();
    if (!name) return respond({ ok: false, error: '버전명을 입력하세요.' });
    if (name.length > 100) return respond({ ok: false, error: '버전명은 100자까지 입력할 수 있습니다.' });
    var message = String((data && data.message) || '').trim();
    if (!message) return respond({ ok: false, error: '저장할 문구를 입력하세요.' });
    if (message.length > 2000) return respond({ ok: false, error: '문자는 2000자까지 저장할 수 있습니다.' });
    var sheet = getPromoVersionSheet_(true);
    var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var created = true;
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_VERSION_HEADERS.length).getDisplayValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0] || '').trim() === name) {
            sheet.getRange(i + 2, 2).setValue(message);
            sheet.getRange(i + 2, 3).setValue(stamp);
            created = false;
            break;
          }
        }
      }
      if (created) sheet.appendRow([name, message, stamp]);
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, name: name, created: created });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 홍보문구 버전 목록 (관리자 전용, 배포 2) — 최신 순. 반환: {ok, versions: [{name, message, createdAt}]} */
function listPromoVersions(data) {
  try {
    checkAdmin(data && data.key);
    var sheet = getPromoVersionSheet_(false);
    var versions = [];
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_VERSION_HEADERS.length).getDisplayValues();
        for (var i = rows.length - 1; i >= 0; i--) {
          versions.push({
            name: String(rows[i][0] || ''),
            message: String(rows[i][1] || ''),
            createdAt: String(rows[i][2] || '')
          });
        }
      }
    }
    return respond({ ok: true, versions: versions });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 홍보문구 버전 삭제 (관리자 전용, 배포 2) — 이름이 정확히 같은 행을 지웁니다. 반환: {ok, name} */
function deletePromoVersion(data) {
  try {
    checkAdmin(data && data.key);
    var name = String((data && data.name) || '').trim();
    if (!name) return respond({ ok: false, error: '삭제할 버전명을 알 수 없습니다.' });
    var sheet = getPromoVersionSheet_(false);
    if (!sheet) return respond({ ok: false, error: '저장된 버전이 없습니다.' });
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_VERSION_HEADERS.length).getDisplayValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0] || '').trim() === name) {
            sheet.deleteRow(i + 2);
            return respond({ ok: true, name: name });
          }
        }
      }
      return respond({ ok: false, error: '없는 버전입니다.' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * 홍보수신자 추가 (관리자 전용, 배포 2)
 * body: { action: 'addPromoRecipients', key: 관리자 키,
 *         recipients?: [{phone, name?, memo?}], text?: '한 줄에 전화번호 이름' 붙여넣기 }
 * 전화번호는 010/011/016/017/018/019 10~11자리만 받고, 이미 있는 번호는
 * 건너뜁니다 (덮지 않습니다). 전화번호 열은 텍스트 형식('@')으로 저장해
 * 앞자리 0이 안 사라지게 합니다.
 * 반환: {ok, added, skipped, errors: [{line, reason}], recipients: [{phone, name, memo}]}
 */
function addPromoRecipients(data) {
  try {
    checkAdmin(data && data.key);
    var input = [];
    if (Array.isArray(data && data.recipients)) input = data.recipients;
    else if (typeof (data && data.text) === 'string') input = String(data.text).split(/\n/);
    if (!input.length) return respond({ ok: false, error: '추가할 번호를 입력하세요.' });
    var parsed = [];
    var errors = [];
    for (var i = 0; i < input.length; i++) {
      var item = input[i];
      if (typeof item === 'string') {
        if (!String(item).trim()) continue;
        var one = parsePromoRecipientLine_(item);
        if (!one) { errors.push({ line: String(item).trim(), reason: '전화번호 형식이 잘못되었습니다.' }); continue; }
        parsed.push({ phone: one.phone, name: one.name, memo: one.memo || '' });
      } else if (item && typeof item === 'object') {
        var p = normalizeMobileDigits_(item.phone);
        if (!isValidMobileDigits_(p)) { errors.push({ line: String(item.phone || ''), reason: '전화번호 형식이 잘못되었습니다.' }); continue; }
        parsed.push({ phone: p, name: String(item.name || '').trim(), memo: String(item.memo || '').trim() });
      }
    }
    if (!parsed.length && !errors.length) return respond({ ok: false, error: '추가할 번호를 입력하세요.' });
    var sheet = getPromoRecipientSheet_(true);
    var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var added = [];
    var skipped = 0;
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var existing = {};
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_RECIPIENT_HEADERS.length).getDisplayValues();
        for (var j = 0; j < rows.length; j++) {
          var ep = normalizeMobileDigits_(rows[j][0]);
          if (ep) existing[ep] = true;
        }
      }
      var toAdd = [];
      var seen = {};
      for (var k = 0; k < parsed.length; k++) {
        var pr = parsed[k];
        if (seen[pr.phone] || existing[pr.phone]) { skipped++; continue; }
        seen[pr.phone] = true;
        toAdd.push(pr);
      }
      if (toAdd.length) {
        var startRow = sheet.getLastRow() + 1;
        var values = [];
        for (var m = 0; m < toAdd.length; m++) {
          values.push([toAdd[m].phone, toAdd[m].name, toAdd[m].memo, 'FALSE', stamp]);
          added.push({ phone: toAdd[m].phone, name: toAdd[m].name, memo: toAdd[m].memo });
        }
        // 전화번호 열(1열)은 쓰는 행에만 텍스트 형식('@')으로 둡니다 — 앞자리 0 유지.
        // 전체 열 지정은 느리고, 쓰는 셀에 바로 지정하는 것이 확실합니다 (송장번호와 같은 방식).
        sheet.getRange(startRow, 1, values.length, 1).setNumberFormat('@');
        sheet.getRange(startRow, 1, values.length, PROMO_RECIPIENT_HEADERS.length).setValues(values);
      }
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, added: added.length, skipped: skipped, errors: errors, recipients: added });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** '문자발송큐' 행들에서 전화번호별 최근 발송을 찾습니다.
 *  행: [예약일시, 번호, 메시지, 상태, 처리시작, 발송일시, 오류].
 *  상태 '발송완료'·'실패'만 보고, 날짜는 발송일시(없으면 예약일시) 기준
 *  가장 최근 것만 남깁니다. 반환: {국내숫자: {date, ok}} — 순수 함수입니다. */
function latestSendByPhone_(queueRows) {
  var map = {};
  for (var i = 0; i < queueRows.length; i++) {
    var r = queueRows[i] || [];
    var status = String(r[3] || '');
    if (status !== '발송완료' && status !== '실패') continue;
    var phone = normalizeMobileDigits_(r[1]);
    if (!isValidMobileDigits_(phone)) continue;
    var date = String(r[5] || r[0] || '');
    if (!date) continue;
    var cur = map[phone];
    if (!cur || date > cur.date) map[phone] = { date: date, ok: status === '발송완료' };
  }
  return map;
}

/** 홍보수신자 목록 (관리자 전용, 배포 2) — 등록 순. 반환: {ok, recipients: [{row, phone, name, memo, optOut, createdAt, lastSend}]} */
function listPromoRecipients(data) {
  try {
    checkAdmin(data && data.key);
    var sheet = getPromoRecipientSheet_(false);
    var recipients = [];
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_RECIPIENT_HEADERS.length).getDisplayValues();
        for (var i = 0; i < rows.length; i++) {
          var flag = String(rows[i][3] || '').trim().toUpperCase();
          recipients.push({
            row: i + 2,
            // 앞자리 0을 잃은 10자리 저장값도 정규화해 돌려줍니다 — 화면·검색·선택이
            // 010-... 11자리로 동작하게 합니다 (시트 값 자체는 건드리지 않습니다).
            phone: normalizeMobileDigits_(String(rows[i][0] || '')),
            name: String(rows[i][1] || ''),
            memo: String(rows[i][2] || ''),
            optOut: flag === 'TRUE' || flag === '1' || flag === 'Y',
            createdAt: String(rows[i][4] || '')
          });
        }
      }
    }
    // 최근 발송: '문자발송큐'에서 전화번호별 최근 발송(발송완료/실패)을 찾아 붙입니다.
    // 큐 탭이 없어도 수신자 목록은 그대로 돌려줍니다.
    var lastSendByPhone = {};
    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var qSheet = ss.getSheetByName(SMS_QUEUE_SHEET_NAME);
      if (qSheet && qSheet.getLastRow() >= 2) {
        var qRows = qSheet.getRange(2, 1, qSheet.getLastRow() - 1, SMS_QUEUE_HEADERS.length).getDisplayValues();
        lastSendByPhone = latestSendByPhone_(qRows);
      }
    } catch (e) {
      lastSendByPhone = {};
    }
    for (var ri = 0; ri < recipients.length; ri++) {
      var key = normalizeMobileDigits_(recipients[ri].phone);
      recipients[ri].lastSend = lastSendByPhone[key] || null;
    }
    return respond({ ok: true, recipients: recipients });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 홍보수신자 삭제 (관리자 전용, 배포 2) — 행 번호(row) 또는 전화번호(phone)로 지웁니다. 반환: {ok, row} */
function deletePromoRecipient(data) {
  try {
    checkAdmin(data && data.key);
    var sheet = getPromoRecipientSheet_(false);
    if (!sheet) return respond({ ok: false, error: '저장된 수신자가 없습니다.' });
    var row = Number((data && data.row) || 0);
    var phone = normalizeMobileDigits_((data && data.phone) || '');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return respond({ ok: false, error: '없는 수신자입니다.' });
      if (row >= 2 && row <= lastRow) {
        sheet.deleteRow(row);
        return respond({ ok: true, row: row });
      }
      if (phone) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_RECIPIENT_HEADERS.length).getDisplayValues();
        for (var i = 0; i < rows.length; i++) {
          // 저장값이 앞자리 0을 잃은 10자리여도 정규화·숫자 그대로 둘 다로 찾습니다.
          if (promoRecipientPhoneMatches_(rows[i][0], phone)) {
            sheet.deleteRow(i + 2);
            return respond({ ok: true, row: i + 2 });
          }
        }
      }
      return respond({ ok: false, error: '없는 수신자입니다.' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 홍보수신자 수신거부 설정 (관리자 전용, 배포 2) — 행 번호(row) 또는 전화번호(phone)로 찾습니다. 반환: {ok, row, phone, optOut} */
function setPromoRecipientOptOut(data) {
  try {
    checkAdmin(data && data.key);
    var optOut = !!(data && data.optOut);
    var sheet = getPromoRecipientSheet_(false);
    if (!sheet) return respond({ ok: false, error: '저장된 수신자가 없습니다.' });
    var row = Number((data && data.row) || 0);
    var phone = normalizeMobileDigits_((data && data.phone) || '');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return respond({ ok: false, error: '없는 수신자입니다.' });
      var target = 0;
      if (row >= 2 && row <= lastRow) target = row;
      else if (phone) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_RECIPIENT_HEADERS.length).getDisplayValues();
        for (var i = 0; i < rows.length; i++) {
          // 저장값이 앞자리 0을 잃은 10자리여도 정규화·숫자 그대로 둘 다로 찾습니다.
          if (promoRecipientPhoneMatches_(rows[i][0], phone)) { target = i + 2; break; }
        }
      }
      if (!target) return respond({ ok: false, error: '없는 수신자입니다.' });
      sheet.getRange(target, 4).setValue(optOut ? 'TRUE' : 'FALSE');
      return respond({
        ok: true,
        row: target,
        phone: normalizeMobileDigits_(String(sheet.getRange(target, 1).getDisplayValue() || '')),
        optOut: optOut
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/** 홍보수신자 이름·메모 수정 (관리자 전용, 배포 2) — 인라인 편집용.
 *  body: { action: 'updatePromoRecipient', key: 관리자 키, row: 행 번호(또는 phone),
 *          name: 이름, memo: 메모 } — 전화번호는 키라서 고치지 않습니다.
 *  반환: {ok, row, phone, name, memo} */
function updatePromoRecipient(data) {
  try {
    checkAdmin(data && data.key);
    var name = String((data && data.name) || '').trim();
    var memo = String((data && data.memo) || '').trim();
    if (name.length > 50) return respond({ ok: false, error: '이름은 50자까지 입력할 수 있습니다.' });
    if (memo.length > 200) return respond({ ok: false, error: '메모는 200자까지 입력할 수 있습니다.' });
    var sheet = getPromoRecipientSheet_(false);
    if (!sheet) return respond({ ok: false, error: '저장된 수신자가 없습니다.' });
    var row = Number((data && data.row) || 0);
    var phone = normalizeMobileDigits_((data && data.phone) || '');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return respond({ ok: false, error: '없는 수신자입니다.' });
      var target = 0;
      if (row >= 2 && row <= lastRow) target = row;
      else if (phone) {
        var rows = sheet.getRange(2, 1, lastRow - 1, PROMO_RECIPIENT_HEADERS.length).getDisplayValues();
        for (var i = 0; i < rows.length; i++) {
          // 저장값이 앞자리 0을 잃은 10자리여도 정규화·숫자 그대로 둘 다로 찾습니다.
          if (promoRecipientPhoneMatches_(rows[i][0], phone)) { target = i + 2; break; }
        }
      }
      if (!target) return respond({ ok: false, error: '없는 수신자입니다.' });
      sheet.getRange(target, 2).setValue(name);
      sheet.getRange(target, 3).setValue(memo);
      return respond({
        ok: true,
        row: target,
        phone: normalizeMobileDigits_(String(sheet.getRange(target, 1).getDisplayValue() || '')),
        name: name,
        memo: memo
      });
    } finally {
      lock.releaseLock();
    }
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

/** 1행 헤더가 비어 있으면 채웁니다 (시트를 새로 만들어도 그대로 동작).
 *  이미 있는 시트에 새 열(우편번호)이 없으면 뒤에 덧붙입니다 — 기존 열은 안 건드립니다. */
function ensureHeader(sheet) {
  var firstCell = sheet.getRange(1, 1).getValue();
  if (!firstCell) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }
  var lastCol = sheet.getLastColumn();
  if (lastCol < HEADERS.length) {
    var missing = HEADERS.slice(lastCol);
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}

/** 스프레드시트 수식으로 해석될 수 있는 입력을 무력화합니다. */
function safe(value) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

/** O열(15) '상품별 배송지' JSON 텍스트를 배열로 바꿉니다. 없거나 깨진 값이면 빈 배열.
 *  trackGet·adminList가 돌려주는 deliveryOverrides가 이 형태입니다. */
function parseDeliveryOverrides_(text) {
  if (!text) return [];
  try {
    var arr = JSON.parse(String(text));
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (d) { return d && d.itemId; });
  } catch (err) {
    return [];
  }
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
  sheet.setColumnWidth(14, 90);   // 우편번호
  sheet.setColumnWidth(15, 260);  // 상품별 배송지 (JSON 텍스트)
  sheet.getRange(2, 4, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('#,##0');
  sheet.getRange(2, 14, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@'); // 우편번호 앞자리 0 유지
  sheet.getRange(2, 15, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@'); // 상품별 배송지 JSON 텍스트 형식 유지
}

/* ============================================================
 *  스프레드시트 시스템화 — polishSheets_()
 *  (2026-11-15, 편집기에서 직접 실행하는 1회성 정리 도구)
 *  주문 접수 시트 + 귤 배송 명단에 드롭다운·조건부 서식·대시보드/
 *  요약 탭을 붙이고, 배송 명단의 날짜 구분 행을 날짜 열로 정규화한다.
 *  - 실행 전 두 시트 모두 백업 탭을 먼저 만든다 (최초 1회만).
 *  - 재실행 안전: 이미 있는 것은 감지해 건너뛰거나 보완만 한다.
 *  - 수량은 건드리지 않는다 ('1 / 1'·'5x2=2' 같은 메모성 표기가 섞여
 *    있어 숫자화가 위험).
 *  - B열(상품명) 드롭다운은 두지 않는다 (2026-11-15 검토 결정).
 *    백엔드가 B열에 "상품명 N박스" 요약(예: 노지감귤 가정용 10kg 1박스)을
 *    쓰기 때문에, 순수 상품명만 허용하는 엄격 모드면 새 주문 저장이
 *    거부되고 경고 모드면 모든 주문 행에 경고 표시가 뜬다.
 * ============================================================ */

/** 귤 배송 명단 스프레드시트 ID (소유자 dibig78 본인). */
var DELIVERY_SHEET_ID = '1CVzN0f4diDlpEVCcW70S3-SN14sepNpIT3Cq6lx6ar8';
/** 배송 명단 원본 탭 이름. */
var DELIVERY_SHEET_NAME = '시트1';
/** 백업 탭 이름 날짜 접미사 (실행일 기준). */
var POLISH_BACKUP_DATE = '20261115';
/** 주문 시트 드롭다운·조건부 서식 적용 범위 끝 행. */
var POLISH_ORDER_ROWS = 1000;
/** 대시보드·요약 수식 참조 범위 끝 행 (헤더 제외, 넉넉하게). */
var POLISH_FORMULA_ROWS = 10000;

/** 두 시트를 한 번에 다듬는다. 편집기에서 직접 실행한다.
 *  반환값: { ok, orders: {...}, delivery: {...} } 요약. */
function polishSheets_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var summary = { ok: true, orders: polishOrdersSheet_(), delivery: polishDeliverySheet_() };
    Logger.log('polishSheets_ done: ' + JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/** 탭을 복제해 백업 탭을 만든다. 이미 있으면 건너뛴다 (최초 1회만). */
function polishBackupTab_(ss, tabName, backupName) {
  var existing = ss.getSheetByName(backupName);
  if (existing) {
    Logger.log('polish backup exists, skip: ' + backupName);
    return { created: false, name: backupName };
  }
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    Logger.log('polish backup failed, tab not found: ' + tabName);
    return { created: false, name: backupName, error: 'tab not found: ' + tabName };
  }
  var copy = sheet.copyTo(ss);
  copy.setName(backupName);
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(ss.getNumSheets());
  Logger.log('polish backup created: ' + backupName);
  return { created: true, name: backupName };
}

/** 조건부 서식 수식 비교용 — 앞의 '=' 유무를 무시한다. */
function polishNormFormula_(f) {
  var s = String(f || '').trim();
  return s.charAt(0) === '=' ? s.substring(1) : s;
}

/** 조건부 서식 규칙을 찾아 수식·범위·배경색을 교체한다.
 *  specs: [{ formula, matchFormulas, background, range }]
 *  - matchFormulas에 들어 있는 수식과 일치하는 기존 규칙은 교체한다.
 *  - 일치하는 규칙이 없으면 새로 추가한다. 그 외 규칙은 그대로 둔다.
 *  (규칙 객체는 변경 불가라, 교체는 같은 위치에 새 규칙을 만드는 방식이다.) */
function polishUpsertConditionalRules_(sheet, specs) {
  var rules = sheet.getConditionalFormatRules();
  var found = {};
  var out = rules.map(function (rule) {
    var cond = rule.getBooleanCondition();
    if (!cond) return rule;
    if (cond.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) return rule;
    var vals = cond.getCriteriaValues();
    var formula = polishNormFormula_(vals && vals[0]);
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      var matches = spec.matchFormulas || [spec.formula];
      var matched = false;
      for (var j = 0; j < matches.length; j++) {
        if (polishNormFormula_(matches[j]) === formula) { matched = true; break; }
      }
      if (matched) {
        found[spec.formula] = true;
        return SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied(spec.formula)
          .setBackground(spec.background)
          .setRanges([spec.range])
          .build();
      }
    }
    return rule;
  });
  specs.forEach(function (spec) {
    if (!found[spec.formula]) {
      out.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(spec.formula)
        .setBackground(spec.background)
        .setRanges([spec.range])
        .build());
    }
  });
  sheet.setConditionalFormatRules(out);
  return found;
}

/** 주문 접수 시트 다듬기. 반환값은 적용 결과 요약. */
function polishOrdersSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var res = { backup: null, paidDropdown: false, productDropdown: false, productNames: [], rules: {}, dashboard: false };
  // 1. 백업 (최초 1회만).
  res.backup = polishBackupTab_(ss, SHEET_NAME, '백업_Sheet1_' + POLISH_BACKUP_DATE);
  var sheet = getSheet();
  ensureHeader(sheet);
  var lastRow = POLISH_ORDER_ROWS;
  // 2. 입금확인 드롭다운 (L2:L1000) — 엄격 모드.
  //    백엔드는 '확인'만 입금으로 판정하고 빈칸은 검증 대상이 아니라서,
  //    기존 값·백엔드 쓰기 모두 그대로 동작한다.
  var paidRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['확인', '미입금'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 12, lastRow - 1, 1).setDataValidation(paidRule);
  res.paidDropdown = true;
  // 3. 조건부 서식 통합 — '미입금'도 주황, 범위를 N·O열까지 확장.
  var range = sheet.getRange(2, 1, lastRow - 1, 15); // A2:O1000
  res.rules = polishUpsertConditionalRules_(sheet, [
    { formula: '=AND($A2<>"",$L2<>"확인")',
      matchFormulas: ['=AND($A2<>"",$L2="")', '=AND($A2<>"",$L2<>"확인")'],
      background: '#fde8e0', range: range },
    { formula: '=AND($A2<>"",$L2="확인")', background: '#e6f4ea', range: range }
  ]);
  // 4. 상품명 드롭다운은 두지 않는다 (2026-11-15 검토 결정).
  //    백엔드가 B열에 "상품명 N박스" 요약(예: 노지감귤 가정용 10kg 1박스)을
  //    쓰는데, 순수 상품명만 허용하는 엄격 모드면 새 주문 저장이 거부되고
  //    경고 모드면 모든 주문 행에 경고 표시가 뜬다. B열은 백엔드 전용이라
  //    드롭다운이 필요 없다.
  res.productDropdown = false;
  // 5. 새 탭 '대시보드' (없으면 생성, 있으면 내용 갱신). 첫 번째 위치로 이동.
  var FR = POLISH_FORMULA_ROWS;
  var T = SHEET_NAME;
  var dashName = '대시보드';
  var dash = ss.getSheetByName(dashName);
  if (!dash) {
    dash = ss.insertSheet(dashName);
  }
  dash.clear();
  var rows = [
    ['항목', '값'],
    ['오늘 주문 수', '=COUNTIFS(' + T + '!A2:A' + FR + ',">="&TODAY(),' + T + '!A2:A' + FR + ',"<"&TODAY()+1)'],
    ['오늘 매출', '=SUMIFS(' + T + '!D2:D' + FR + ',' + T + '!A2:A' + FR + ',">="&TODAY(),' + T + '!A2:A' + FR + ',"<"&TODAY()+1)'],
    ['미입금 건수', '=COUNTIFS(' + T + '!A2:A' + FR + ',"<>",' + T + '!L2:L' + FR + ',"<>확인")'],
    ['미입금 금액', '=SUMIFS(' + T + '!D2:D' + FR + ',' + T + '!A2:A' + FR + ',"<>",' + T + '!L2:L' + FR + ',"<>확인")'],
    ['출고 대기 (입금됨·송장없음)', '=COUNTIFS(' + T + '!A2:A' + FR + ',"<>",' + T + '!L2:L' + FR + ',"확인",' + T + '!M2:M' + FR + ',"")'],
    ['전체 주문 수', '=COUNTA(' + T + '!A2:A' + FR + ')'],
    ['전체 매출', '=SUM(' + T + '!D2:D' + FR + ')'],
    ['기준: ' + T + ' 주문 탭. 입금확인은 "확인"만 입금으로 봅니다.', '']
  ];
  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  dash.getRange(1, 1, 1, 2).setFontWeight('bold');
  dash.getRange(3, 2).setNumberFormat('#,##0원'); // 오늘 매출
  dash.getRange(5, 2).setNumberFormat('#,##0원'); // 미입금 금액
  dash.getRange(8, 2).setNumberFormat('#,##0원'); // 전체 매출
  dash.setFrozenRows(1);
  dash.setColumnWidth(1, 260);
  dash.setColumnWidth(2, 160);
  ss.setActiveSheet(dash);
  ss.moveActiveSheet(1);
  res.dashboard = true;
  Logger.log('polishOrdersSheet_: ' + JSON.stringify(res));
  return res;
}

/** 배송 명단 상태 판정 — G '발송 제외' > '중복' > D '취소' > '정상'. 원본은 안 건든다. */
function polishDeliveryStatus_(productName, ocrNote) {
  var d = String(productName || '');
  var g = String(ocrNote || '');
  if (g.indexOf('발송 제외') !== -1) return '발송 제외';
  if (d.indexOf('중복') !== -1 || g.indexOf('중복') !== -1) return '중복';
  if (d.indexOf('취소') !== -1) return '취소';
  return '정상';
}

/** 구분 행 C열 '10/20(2)'·'11/13 (2)'에서 월/일을 뽑아 2026년 날짜로 만든다. 못 읽으면 null. */
function polishDeliveryDate_(label) {
  var s = String(label || '').trim();
  var m = s.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  var month = Number(m[1]);
  var day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  var d = new Date(2026, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** 귤 배송 명단 다듬기. 반환값은 적용 결과 요약. */
function polishDeliverySheet_() {
  var ss = SpreadsheetApp.openById(DELIVERY_SHEET_ID);
  var res = {
    backup: null, separatorsFound: 0, separatorsDeleted: 0, separatorsSkipped: [],
    items: 0, datesFilled: 0, statusFilled: 0, statusCounts: {},
    expandedQuotes: 0, cellsChanged: 0, summary: false
  };
  // 1. 백업 (최초 1회만).
  res.backup = polishBackupTab_(ss, DELIVERY_SHEET_NAME, '백업_' + POLISH_BACKUP_DATE);
  var sheet = ss.getSheetByName(DELIVERY_SHEET_NAME);
  if (!sheet) { res.error = 'tab not found: ' + DELIVERY_SHEET_NAME; return res; }
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(9, sheet.getLastColumn());
  if (lastRow < 2) { res.error = 'no data rows'; return res; }
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues(); // [0] = 헤더
  // 2. 위→아래 스캔: 구분 행은 날짜를 기록하고 삭제 대상으로, 항목 행은 정리한다.
  //    ' 전개는 바로 윗 *항목* 기준 (구분 행은 건너뛴다 — 구분 행의 D·E·F는 비어 있다).
  var currentDate = null;
  var toDelete = []; // 시트 행 번호 (1-based)
  var items = [];    // { date, status, row: [A..G 정리된 값], changed, hOrig, iOrig, hBlank, iBlank }
  var prev = [null, null, null]; // D·E·F 바로 윗 항목의 전개된 값
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var g = String(row[6] == null ? '' : row[6]).trim();
    if (g === '날짜·페이지 구분선') {
      res.separatorsFound++;
      var d = polishDeliveryDate_(row[2]);
      if (d) {
        currentDate = d;
        toDelete.push(r + 1); // 시트 행 번호
      } else {
        // 날짜를 못 읽으면 삭제하지 않고 남긴다 (데이터 보호).
        res.separatorsSkipped.push(r + 1);
        Logger.log('polish delivery: separator without a readable date, kept, row ' + (r + 1) + ', C=' + JSON.stringify(row[2]));
      }
      continue;
    }
    // 항목 행: A~G trim + D·E·F ' 전개.
    var cleaned = [];
    var changed = false;
    var cellsChanged = 0;
    for (var c = 0; c < 7; c++) {
      var v = row[c];
      if (typeof v === 'string') {
        var t = v.trim();
        if (t !== v) { changed = true; cellsChanged++; }
        v = t;
      }
      cleaned.push(v);
    }
    var expanded = 0;
    for (var k = 0; k < 3; k++) {
      var col = 3 + k;
      if (cleaned[col] === "'") {
        if (prev[k] !== null && prev[k] !== undefined) {
          cleaned[col] = prev[k];
          expanded++;
          changed = true;
          cellsChanged++;
        }
        // 윗 항목이 없으면 ' 그대로 둔다.
      }
      // '가 그대로면 prev는 그대로 둔다 (다음 '가 마지막 실제 값을 따르게).
      if (cleaned[col] !== "'") prev[k] = cleaned[col];
    }
    var status = polishDeliveryStatus_(cleaned[3], cleaned[6]);
    res.statusCounts[status] = (res.statusCounts[status] || 0) + 1;
    res.expandedQuotes += expanded;
    res.cellsChanged += cellsChanged;
    items.push({
      date: currentDate,
      status: status,
      row: cleaned,
      changed: changed,
      hOrig: values[r][7],
      iOrig: values[r][8],
      hBlank: String(values[r][7] == null ? '' : values[r][7]).trim() === '',
      iBlank: String(values[r][8] == null ? '' : values[r][8]).trim() === ''
    });
  }
  res.items = items.length;
  if (items.length === 0) { res.error = 'no item rows found'; return res; }
  // 3. 구분 행 삭제 (아래에서 위로 — 행 번호 밀림 방지).
  for (var di = toDelete.length - 1; di >= 0; di--) {
    sheet.deleteRow(toDelete[di]);
  }
  res.separatorsDeleted = toDelete.length;
  var newLastRow = 1 + items.length;
  // 4. 바뀐 A~G 행만 쓴다 — 연속된 행은 한 번의 setValues로 묶는다.
  //    (삭제 뒤라 항목 i는 시트 행 2+i에 있다.)
  var writeStart = -1;
  for (var w = 0; w <= items.length; w++) {
    var isChanged = w < items.length && items[w].changed;
    if (isChanged && writeStart < 0) writeStart = w;
    if (!isChanged && writeStart >= 0) {
      var block = [];
      for (var j = writeStart; j < w; j++) block.push(items[j].row);
      sheet.getRange(2 + writeStart, 1, block.length, 7).setValues(block);
      writeStart = -1;
    }
  }
  // 5. H(날짜)·I(상태) — 빈 칸만 채운다 (이미 있는 값은 수동 입력으로 보고 보존).
  var hi = [];
  for (var h = 0; h < items.length; h++) {
    var it = items[h];
    var dateVal = it.hBlank ? (it.date || '') : it.hOrig;
    var statusVal = it.iBlank ? it.status : it.iOrig;
    if (it.hBlank && it.date) res.datesFilled++;
    if (it.iBlank) res.statusFilled++;
    hi.push([dateVal, statusVal]);
  }
  sheet.getRange(2, 8, items.length, 2).setValues(hi);
  // 6. 헤더 H1='날짜', I1='상태' (비어 있을 때만).
  if (String(values[0][7] || '').trim() === '') sheet.getRange(1, 8).setValue('날짜');
  if (String(values[0][8] || '').trim() === '') sheet.getRange(1, 9).setValue('상태');
  sheet.getRange(2, 8, items.length, 1).setNumberFormat('yyyy-mm-dd');
  // 7. 필터 + 헤더 고정 + 상태 드롭다운 (엄격 모드 — I열은 이 함수와 사람만 쓴다).
  sheet.setFrozenRows(1);
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, newLastRow, 9).createFilter();
  }
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['정상', '취소', '중복', '발송 제외'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 9, items.length, 1).setDataValidation(statusRule);
  // 8. 조건부 서식 (행 전체 A2:I<마지막행>).
  var crange = sheet.getRange(2, 1, items.length, 9); // A2:I<마지막행>
  polishUpsertConditionalRules_(sheet, [
    { formula: '=$I2="취소"', background: '#e8eaed', range: crange },
    { formula: '=$I2="중복"', background: '#fde8e0', range: crange },
    { formula: '=$I2="발송 제외"', background: '#fce8e6', range: crange }
  ]);
  // 9. 새 탭 '요약' (없으면 생성, 있으면 내용 갱신). 첫 번째 위치로 이동.
  var FR = POLISH_FORMULA_ROWS;
  var D = DELIVERY_SHEET_NAME;
  var sumName = '요약';
  var sum = ss.getSheetByName(sumName);
  if (!sum) {
    sum = ss.insertSheet(sumName);
  }
  sum.clear();
  // 날짜별 건수 (상위 10개) — 스캔 결과에서 집계 (재실행 시 H열 기존 날짜도 포함).
  var dateCounts = {};
  var dateObjs = {};
  items.forEach(function (it) {
    var eff = it.date;
    if (!eff && it.hOrig instanceof Date) eff = it.hOrig;
    if (!eff) return;
    var key = Utilities.formatDate(eff, TIMEZONE, 'yyyy-MM-dd');
    dateCounts[key] = (dateCounts[key] || 0) + 1;
    if (!dateObjs[key]) dateObjs[key] = eff;
  });
  var dateKeys = Object.keys(dateCounts).sort(function (a, b) { return dateCounts[b] - dateCounts[a]; }).slice(0, 10);
  var srows = [
    ['항목', '값'],
    ['전체 항목 수', '=COUNTA(' + D + '!A2:A' + FR + ')'],
    ['정상', '=COUNTIF(' + D + '!I2:I' + FR + ',"정상")'],
    ['취소', '=COUNTIF(' + D + '!I2:I' + FR + ',"취소")'],
    ['중복', '=COUNTIF(' + D + '!I2:I' + FR + ',"중복")'],
    ['발송 제외', '=COUNTIF(' + D + '!I2:I' + FR + ',"발송 제외")'],
    ['', ''],
    ['날짜별 건수 (상위 10개)', ''],
    ['날짜', '건수']
  ];
  dateKeys.forEach(function (key, idx) {
    var rowNum = 10 + idx;
    srows.push([dateObjs[key], '=COUNTIFS(' + D + '!H2:H' + FR + ',A' + rowNum + ')']);
  });
  sum.getRange(1, 1, srows.length, 2).setValues(srows);
  sum.getRange(1, 1, 1, 2).setFontWeight('bold');
  sum.getRange(9, 1, 1, 2).setFontWeight('bold');
  if (dateKeys.length > 0) sum.getRange(10, 1, dateKeys.length, 1).setNumberFormat('yyyy-mm-dd');
  sum.setFrozenRows(1);
  sum.setColumnWidth(1, 260);
  sum.setColumnWidth(2, 160);
  ss.setActiveSheet(sum);
  ss.moveActiveSheet(1);
  res.summary = true;
  Logger.log('polishDeliverySheet_: ' + JSON.stringify(res));
  return res;
}
