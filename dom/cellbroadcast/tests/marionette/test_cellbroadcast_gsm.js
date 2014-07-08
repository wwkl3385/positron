/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

MARIONETTE_TIMEOUT = 60000;
MARIONETTE_HEAD_JS = 'head.js';

const CB_MAX_CONTENT_7BIT = Math.floor((CB_MESSAGE_SIZE_GSM - 6) * 8 / 7);
const CB_MAX_CONTENT_UCS2 = Math.floor((CB_MESSAGE_SIZE_GSM - 6) / 2);

const BODY_7BITS = "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@"
                 + "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@"
                 + "@@@@@@@@@@@@@"; // 93 ascii chars.
const BODY_7BITS_IND = BODY_7BITS.substr(3);
const BODY_UCS2 = "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"
                + "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"
                + "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"
                + "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"
                + "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"
                + "\u0000"; // 41 unicode chars.
const BODY_UCS2_IND = BODY_UCS2.substr(1);

is(BODY_7BITS.length,     CB_MAX_CONTENT_7BIT,     "BODY_7BITS.length");
is(BODY_7BITS_IND.length, CB_MAX_CONTENT_7BIT - 3, "BODY_7BITS_IND.length");
is(BODY_UCS2.length,      CB_MAX_CONTENT_UCS2,     "BODY_UCS2.length");
is(BODY_UCS2_IND.length,  CB_MAX_CONTENT_UCS2 - 1, "BODY_UCS2_IND.length");

function testReceiving_GSM_MessageAttributes() {
  log("Test receiving GSM Cell Broadcast - Message Attributes");

  let verifyCBMessage = (aMessage) => {
    // Attributes other than `language` and `body` should always be assigned.
    ok(aMessage.gsmGeographicalScope != null, "aMessage.gsmGeographicalScope");
    ok(aMessage.messageCode != null, "aMessage.messageCode");
    ok(aMessage.messageId != null, "aMessage.messageId");
    ok(aMessage.language != null, "aMessage.language");
    ok(aMessage.body != null, "aMessage.body");
    ok(aMessage.messageClass != null, "aMessage.messageClass");
    ok(aMessage.timestamp != null, "aMessage.timestamp");
    ok('etws' in aMessage, "aMessage.etws");
    if (aMessage.etws) {
      ok('warningType' in aMessage.etws, "aMessage.etws.warningType");
      ok(aMessage.etws.emergencyUserAlert != null, "aMessage.etws.emergencyUserAlert");
      ok(aMessage.etws.popup != null, "aMessage.etws.popup");
    }
    ok(aMessage.cdmaServiceCategory != null, "aMessage.cdmaServiceCategory");
  };

  // Here we use a simple GSM message for test.
  let pdu = buildHexStr(0, CB_MESSAGE_SIZE_GSM * 2);

  return sendMultipleRawCbsToEmulatorAndWait([pdu])
    .then((aMessage) => verifyCBMessage(aMessage));
}

function testReceiving_GSM_GeographicalScope() {
  log("Test receiving GSM Cell Broadcast - Geographical Scope");

  let promise = Promise.resolve();

  let verifyCBMessage = (aMessage, aGsName) => {
    is(aMessage.gsmGeographicalScope, aGsName,
       "aMessage.gsmGeographicalScope");
  };

  CB_GSM_GEOGRAPHICAL_SCOPE_NAMES.forEach(function(aGsName, aIndex) {
    let pdu = buildHexStr(((aIndex & 0x03) << 14), 4)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 2) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aGsName));
  });

  return promise;
}

function testReceiving_GSM_MessageCode() {
  log("Test receiving GSM Cell Broadcast - Message Code");

  let promise = Promise.resolve();

  // Message Code has 10 bits, and is ORed into a 16 bits 'serial' number. Here
  // we test every single bit to verify the operation doesn't go wrong.
  let messageCodes = [
    0x000, 0x001, 0x002, 0x004, 0x008, 0x010, 0x020, 0x040,
    0x080, 0x100, 0x200, 0x251
  ];

  let verifyCBMessage = (aMessage, aMsgCode) => {
    is(aMessage.messageCode, aMsgCode, "aMessage.messageCode");
  };

  messageCodes.forEach(function(aMsgCode) {
    let pdu = buildHexStr(((aMsgCode & 0x3FF) << 4), 4)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 2) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aMsgCode));
  });

  return promise;
}

function testReceiving_GSM_MessageId() {
  log("Test receiving GSM Cell Broadcast - Message Identifier");

  let promise = Promise.resolve();

  // Message Identifier has 16 bits, but no bitwise operation is needed.
  // Test some selected values only.
  let messageIds = [
    0x0000, 0x0001, 0x0010, 0x0100, 0x1000, 0x1111, 0x8888, 0x8811,
  ];

  let verifyCBMessage = (aMessage, aMessageId) => {
    is(aMessage.messageId, aMessageId, "aMessage.messageId");
    ok(aMessage.etws == null, "aMessage.etws");
  };

  messageIds.forEach(function(aMessageId) {
    let pdu = buildHexStr(0, 4)
            + buildHexStr((aMessageId & 0xFFFF), 4)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 4) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aMessageId));
  });

  return promise;
}

function testReceiving_GSM_Language_and_Body() {
  log("Test receiving GSM Cell Broadcast - Language & Body");

  let promise = Promise.resolve();

  let testDcs = [];
  dcs = 0;
  while (dcs <= 0xFF) {
    try {
      let dcsInfo = { dcs: dcs };
      [ dcsInfo.encoding, dcsInfo.language,
        dcsInfo.indicator, dcsInfo.messageClass ] = decodeGsmDataCodingScheme(dcs);
      testDcs.push(dcsInfo);
    } catch (e) {
      // Unsupported coding group, skip.
      let dcs = (dcs & PDU_DCS_CODING_GROUP_BITS) + 0x10;
    }
    dcs++;
  }

  let verifyCBMessage = (aMessage, aDcsInfo) => {
    if (aDcsInfo.language) {
      is(aMessage.language, aDcsInfo.language, "aMessage.language");
    } else if (aDcsInfo.indicator) {
      is(aMessage.language, "@@", "aMessage.language");
    } else {
      ok(aMessage.language == null, "aMessage.language");
    }

    switch (aDcsInfo.encoding) {
      case PDU_DCS_MSG_CODING_7BITS_ALPHABET:
        is(aMessage.body, aDcsInfo.indicator ? BODY_7BITS_IND : BODY_7BITS, "aMessage.body");
        break;
      case PDU_DCS_MSG_CODING_8BITS_ALPHABET:
        ok(aMessage.body == null, "aMessage.body");
        break;
      case PDU_DCS_MSG_CODING_16BITS_ALPHABET:
        is(aMessage.body, aDcsInfo.indicator ? BODY_UCS2_IND : BODY_UCS2, "aMessage.body");
        break;
    }

    is(aMessage.messageClass, aDcsInfo.messageClass, "aMessage.messageClass");
  };

  testDcs.forEach(function(aDcsInfo) {
    let pdu = buildHexStr(0, 8)
            + buildHexStr(aDcsInfo.dcs, 2)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 5) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aDcsInfo));
  });

  return promise;
}

function testReceiving_GSM_Timestamp() {
  log("Test receiving GSM Cell Broadcast - Timestamp");

  let verifyCBMessage = (aMessage) => {
    // Cell Broadcast messages do not contain a timestamp field (however, ETWS
    // does). We only check the timestamp doesn't go too far (60 seconds) here.
    let msMessage = aMessage.timestamp;
    let msNow = Date.now();
    ok(Math.abs(msMessage - msNow) < (1000 * 60), "aMessage.timestamp");
  };

  let pdu = buildHexStr(0, CB_MESSAGE_SIZE_GSM * 2);

  return sendMultipleRawCbsToEmulatorAndWait([pdu])
    .then((aMessage) => verifyCBMessage(aMessage));
}

function testReceiving_GSM_WarningType() {
  log("Test receiving GSM Cell Broadcast - Warning Type");

  let promise = Promise.resolve();

  let messageIds = [];
  for (let i = CB_GSM_MESSAGEID_ETWS_BEGIN; i <= CB_GSM_MESSAGEID_ETWS_END; i++) {
    messageIds.push(i);
  }

  let verifyCBMessage = (aMessage, aMessageId) => {
    is(aMessage.messageId, aMessageId, "aMessage.messageId");
    ok(aMessage.etws != null, "aMessage.etws");

    let offset = aMessageId - CB_GSM_MESSAGEID_ETWS_BEGIN;
    if (offset < CB_ETWS_WARNING_TYPE_NAMES.length) {
      is(aMessage.etws.warningType, CB_ETWS_WARNING_TYPE_NAMES[offset],
         "aMessage.etws.warningType");
    } else {
      ok(aMessage.etws.warningType == null, "aMessage.etws.warningType");
    }
  };

  messageIds.forEach(function(aMessageId) {
    let pdu = buildHexStr(0, 4)
            + buildHexStr((aMessageId & 0xFFFF), 4)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 4) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aMessageId));
  });

  return promise;
}

function testReceiving_GSM_EmergencyUserAlert() {
  log("Test receiving GSM Cell Broadcast - Emergency User Alert");

  let promise = Promise.resolve();

  let emergencyUserAlertMasks = [0x2000, 0x0000];

  let verifyCBMessage = (aMessage, aMask) => {
    is(aMessage.messageId, CB_GSM_MESSAGEID_ETWS_BEGIN, "aMessage.messageId");
    ok(aMessage.etws != null, "aMessage.etws");
    is(aMessage.etws.emergencyUserAlert, aMask != 0, "aMessage.etws.emergencyUserAlert");
  };

  emergencyUserAlertMasks.forEach(function(aMask) {
    let pdu = buildHexStr(aMask, 4)
            + buildHexStr(CB_GSM_MESSAGEID_ETWS_BEGIN, 4)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 4) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aMask));
  });

  return promise;
}

function testReceiving_GSM_Popup() {
  log("Test receiving GSM Cell Broadcast - Popup");

  let promise = Promise.resolve();

  let popupMasks = [0x1000, 0x0000];

  let verifyCBMessage = (aMessage, aMask) => {
    is(aMessage.messageId, CB_GSM_MESSAGEID_ETWS_BEGIN, "aMessage.messageId");
    ok(aMessage.etws != null, "aMessage.etws");
    is(aMessage.etws.popup, aMask != 0, "aMessage.etws.popup");
  };

  popupMasks.forEach(function(aMask) {
    let pdu = buildHexStr(aMask, 4)
            + buildHexStr(CB_GSM_MESSAGEID_ETWS_BEGIN, 4)
            + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 4) * 2);
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait([pdu]))
      .then((aMessage) => verifyCBMessage(aMessage, aMask));
  });

  return promise;
}

function testReceiving_GSM_Multipart() {
  log("Test receiving GSM Cell Broadcast - Multipart Messages");

  let promise = Promise.resolve();

  // According to 9.4.1.2.4 Page Parameter in TS 23.041, the maximal Number of
  // pages per CB message is 15.
  let numParts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  let verifyCBMessage = (aMessage, aNumParts) => {
      is(aMessage.body.length, (aNumParts * CB_MAX_CONTENT_7BIT),
         "aMessage.body");
  };

  numParts.forEach(function(aNumParts) {
    let pdus = [];
    for (let i = 1; i <= aNumParts; i++) {
      let pdu = buildHexStr(0, 10)
              + buildHexStr((i << 4) + aNumParts, 2)
              + buildHexStr(0, (CB_MESSAGE_SIZE_GSM - 6) * 2);
      pdus.push(pdu);
    }
    promise = promise
      .then(() => sendMultipleRawCbsToEmulatorAndWait(pdus))
      .then((aMessage) => verifyCBMessage(aMessage, aNumParts));
  });

  return promise;
}

function testReceiving_GSM_ServiceCategory() {
  log("Test receiving GSM Cell Broadcast - Service Category");

  let verifyCBMessage = (aMessage) => {
    // Bug 910091
    // "Service Category" is not defined in GSM.  We should always get '0' here.
    is(aMessage.cdmaServiceCategory, 0, "aMessage.cdmaServiceCategory");
  };

  let pdu = buildHexStr(0, CB_MESSAGE_SIZE_GSM * 2);
  return sendMultipleRawCbsToEmulatorAndWait([pdu])
    .then((aMessage) => verifyCBMessage(aMessage));
}

startTestCommon(function testCaseMain() {
  return testReceiving_GSM_MessageAttributes()
    .then(() => testReceiving_GSM_GeographicalScope())
    .then(() => testReceiving_GSM_MessageCode())
    .then(() => testReceiving_GSM_MessageId())
    .then(() => testReceiving_GSM_Language_and_Body())
    .then(() => testReceiving_GSM_Timestamp())
    .then(() => testReceiving_GSM_WarningType())
    .then(() => testReceiving_GSM_EmergencyUserAlert())
    .then(() => testReceiving_GSM_Popup())
    .then(() => testReceiving_GSM_Multipart())
    .then(() => testReceiving_GSM_ServiceCategory());
});
