#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <EEPROM.h>

// Hardware Pins
#define RST_PIN  22    // RFID Reset
#define SS_PIN   5     // RFID SDA
#define GREEN    25    // Green LED
#define RED      14    // Red LED
#define BUZZER   13    // Buzzer

// WiFi Credentials
const char* ssid = "Joe's";
const char* password = "12345678";

// Google Sheets
const char* host = "script.google.com";
const String webAppUrl = "/macros/s/AKfycbxDz1wCr61AC86YMy6AOPJp7kVW2tmddHUe1TTTb-SBStWJ_cFGLS1gCoVLP6ypu7ir/exec";
const String apiKey = "rfidProject"; // Must match Apps Script

MFRC522 mfrc522(SS_PIN, RST_PIN);

// Configuration
const byte masterUID[] = {0x36, 0xF8, 0xC4, 0x01}; // Replace with your actual master UID
const int maxUIDs = 20;
const unsigned long addModeTimeout = 30000; // 30s timeout
byte authorizedUIDs[maxUIDs][4];
int uidCount = 0;
bool addMode = false;
unsigned long addModeStartTime = 0;
unsigned long lastScan = 0;
const int scanDelay = 1000;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();
  EEPROM.begin(512);

  pinMode(GREEN, OUTPUT);
  pinMode(RED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  loadUIDs();
  if (uidCount == 0) {
    memcpy(authorizedUIDs[0], masterUID, 4);
    uidCount = 1;
    saveUIDs();
  }

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected: " + WiFi.localIP().toString());
  Serial.println("System Ready");
}

void loop() {
  if (addMode && millis() - addModeStartTime > addModeTimeout) {
    toggleAddMode();
  }

  if (millis() - lastScan > scanDelay && mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    lastScan = millis();
    String uidStr = getUIDString(mfrc522.uid.uidByte);
    Serial.println("Scanned: " + uidStr);

    if (isMasterCard(mfrc522.uid.uidByte)) {
      toggleAddMode();
      logToGoogleSheets(uidStr, "ADD_MODE_TOGGLE", "MASTER");
    } 
    else if (addMode) {
      manageUID(mfrc522.uid.uidByte);
    } 
    else {
      checkAuthorization(mfrc522.uid.uidByte);
    }

    mfrc522.PICC_HaltA();
  }
}

// =============== GOOGLE SHEETS INTEGRATION ===============
void logToGoogleSheets(String uid, String status, String cardType) {
  WiFiClientSecure client;
  client.setInsecure(); // For testing (remove in production)
  
  String url = webAppUrl + "?key=" + apiKey + 
               "&uid=" + uid + 
               "&status=" + status + 
               "&cardType=" + cardType;

  if (client.connect(host, 443)) {
    client.print(String("GET ") + url + " HTTP/1.1\r\n" +
                 "Host: " + host + "\r\n" +
                 "Connection: close\r\n\r\n");
    
    delay(500);
    while (client.connected()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") break;
    }
    client.stop();
  }
}

String getUIDString(byte* uid) {
  String str;
  for (byte i = 0; i < 4; i++) {
    if (uid[i] < 0x10) str += "0";
    str += String(uid[i], HEX);
  }
  return str;
}

bool isMasterCard(byte* uid) {
  return memcmp(uid, masterUID, 4) == 0;
}

// =============== ORIGINAL UID MANAGEMENT (UNCHANGED) ===============
void loadUIDs() {
  uidCount = EEPROM.read(0);
  if (uidCount > maxUIDs) uidCount = 0;
  
  for (int i = 0; i < uidCount; i++) {
    for (byte j = 0; j < 4; j++) {
      authorizedUIDs[i][j] = EEPROM.read(1 + (i*4) + j);
    }
  }
  Serial.print("Loaded ");
  Serial.print(uidCount);
  Serial.println(" UIDs from EEPROM");
}

void saveUIDs() {
  EEPROM.write(0, uidCount);
  for (int i = 0; i < uidCount; i++) {
    for (byte j = 0; j < 4; j++) {
      EEPROM.write(1 + (i*4) + j, authorizedUIDs[i][j]);
    }
  }
  EEPROM.commit();
  Serial.println("UIDs saved to EEPROM");
}

void toggleAddMode() {
  addMode = !addMode;
  if (addMode) {
    addModeStartTime = millis();
    Serial.println("ADD MODE ACTIVATED (30s timeout)");
    digitalWrite(GREEN, HIGH);
    digitalWrite(RED, HIGH);
    tone(BUZZER, 1500, 300);
  } else {
    Serial.println("ADD MODE DEACTIVATED");
    digitalWrite(GREEN, LOW);
    digitalWrite(RED, LOW);
    tone(BUZZER, 1000, 300);
  }
  delay(500);
}

void manageUID(byte* uid) {
  int foundIndex = findUIDIndex(uid);
  if (foundIndex >= 0) {
    if (memcmp(uid, masterUID, 4) != 0) {
      removeUID(foundIndex);
    } else {
      Serial.println("Master UID cannot be removed!");
      denyFeedback();
    }
  } else {
    addUID(uid);
  }
}

int findUIDIndex(byte* uid) {
  for (int i = 0; i < uidCount; i++) {
    if (memcmp(uid, authorizedUIDs[i], 4) == 0) return i;
  }
  return -1;
}

void removeUID(int index) {
  for (int i = index; i < uidCount - 1; i++) {
    memcpy(authorizedUIDs[i], authorizedUIDs[i+1], 4);
  }
  uidCount--;
  saveUIDs();
  
  Serial.println("UID removed!");
  digitalWrite(GREEN, LOW);
  digitalWrite(RED, LOW);
  delay(100);
  digitalWrite(RED, HIGH);
  tone(BUZZER, 300, 500);
  delay(500);
  digitalWrite(GREEN, HIGH);
}

void addUID(byte* uid) {
  if (uidCount < maxUIDs) {
    memcpy(authorizedUIDs[uidCount], uid, 4);
    uidCount++;
    saveUIDs();
    
    Serial.println("UID added!");
    digitalWrite(GREEN, LOW);
    digitalWrite(RED, LOW);
    delay(100);
    digitalWrite(GREEN, HIGH);
    tone(BUZZER, 1000, 200);
    delay(500);
    digitalWrite(RED, HIGH);
  } else {
    Serial.println("Storage full!");
    denyFeedback();
  }
}

void checkAuthorization(byte* uid) {
  String uidStr = getUIDString(uid);
  
  if (findUIDIndex(uid) >= 0) {
    Serial.println("ACCESS GRANTED");
    digitalWrite(GREEN, HIGH);
    tone(BUZZER, 1000, 200);
    logToGoogleSheets(uidStr, "GRANTED", isMasterCard(uid) ? "MASTER" : "USER"); // Added this line
    delay(1000);
    digitalWrite(GREEN, LOW);
  } else {
    Serial.println("ACCESS DENIED");
    digitalWrite(RED, HIGH);
    tone(BUZZER, 300, 1000);
    logToGoogleSheets(uidStr, "DENIED", "UNKNOWN"); // Added this line
    delay(1000);
    digitalWrite(RED, LOW);
  }
}

void denyFeedback() {
  digitalWrite(RED, HIGH);
  tone(BUZZER, 300, 1000);
  delay(1000);
  digitalWrite(RED, LOW);
}

void factoryReset() {
  uidCount = 1;
  memcpy(authorizedUIDs[0], masterUID, 4);
  memset(authorizedUIDs[1], 0, sizeof(authorizedUIDs)-4);
  saveUIDs();
  
  for (byte i = 0; i < 3; i++) {
    digitalWrite(RED, HIGH);
    tone(BUZZER, 500, 200);
    delay(200);
    digitalWrite(RED, LOW);
    delay(200);
  }
}
