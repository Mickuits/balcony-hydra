// ============================================================
// Arduino.h + Wire.h + ArduinoJson.h + Adafruit sensors
// Complete Mock Layer for Native Testing
// ============================================================
#pragma once
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cstdarg>
#include <cmath>
#include <cstdlib>
#include <string>
#include <map>
#include <vector>
#include <algorithm>
#include <functional>
#include <time.h>

typedef uint8_t byte;
typedef bool boolean;
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define HIGH 1
#define LOW 0
#define FALLING 2
#define IRAM_ATTR
#define PROGMEM

namespace MockHW {
    inline uint8_t pinModes[40]={};
    inline uint8_t pinStates[40]={};
    inline uint16_t adcValues[40]={};
    inline uint32_t _millis=0;
    // esp_random() mock — counter incrémental pour tests déterministes.
    // setRandomSeed() permet de réinitialiser entre les tests.
    inline uint32_t _randomCounter=0x12345678;
    inline void setRandomSeed(uint32_t seed){_randomCounter=seed;}
    struct GpioEvent{uint8_t pin;uint8_t value;uint32_t ts;};
    inline std::vector<GpioEvent> gpioLog;
    inline void reset(){memset(pinModes,0,40);memset(pinStates,0,40);memset(adcValues,0,80);_millis=0;gpioLog.clear();_randomCounter=0x12345678;}
    inline void advanceMillis(uint32_t ms){_millis+=ms;}
    inline void setMillis(uint32_t ms){_millis=ms;}
    inline void setADC(uint8_t p,uint16_t v){if(p<40)adcValues[p]=v;}
    inline bool wasGpioSet(uint8_t p,uint8_t v){for(auto&e:gpioLog)if(e.pin==p&&e.value==v)return true;return false;}
    inline uint8_t getPin(uint8_t p){return p<40?pinStates[p]:0;}
}

inline void pinMode(uint8_t p,uint8_t m){if(p<40)MockHW::pinModes[p]=m;}
inline void digitalWrite(uint8_t p,uint8_t v){if(p<40){MockHW::pinStates[p]=v;MockHW::gpioLog.push_back({p,v,MockHW::_millis});}}
inline uint8_t digitalRead(uint8_t p){return p<40?MockHW::pinStates[p]:0;}
inline uint16_t analogRead(uint8_t p){return p<40?MockHW::adcValues[p]:0;}
inline uint32_t millis(){return MockHW::_millis;}
inline uint32_t micros(){return MockHW::_millis*1000;}
inline void delay(uint32_t ms){MockHW::_millis+=ms;}
inline void delayMicroseconds(uint32_t us){MockHW::_millis+=us/1000;}

// esp_random() mock : retourne un PRNG simple (LCG) pour tests déterministes.
// Pas crypto-secure mais suffit pour valider que ConfigManager::getOrCreateApiToken
// génère bien des 32 chars hex différents à chaque appel.
inline uint32_t esp_random(){MockHW::_randomCounter=MockHW::_randomCounter*1103515245u+12345u;return MockHW::_randomCounter;}
inline void yield(){}
// pulseIn: mock returns ~17cm equivalent (1000us at 343m/s)
// Tests can override via MockHW if precise distance simulation is needed.
inline unsigned long pulseIn(uint8_t /*pin*/, uint8_t /*state*/, unsigned long /*timeout*/=1000000UL){return 1000UL;}
// isnan is in <cmath> as std::isnan but Arduino code uses bare isnan()
#ifndef isnan
using std::isnan;
#endif
#ifndef constrain
#define constrain(x,lo,hi) ((x)<(lo)?(lo):((x)>(hi)?(hi):(x)))
#endif
inline long map(long x,long il,long ih,long ol,long oh){return(x-il)*(oh-ol)/(ih-il)+ol;}
#define radians(d) ((d)*M_PI/180.0)
#define degrees(r) ((r)*180.0/M_PI)
inline void attachInterrupt(uint8_t,void(*)(),int){}
inline uint8_t digitalPinToInterrupt(uint8_t p){return p;}
inline void ledcSetup(uint8_t,uint32_t,uint8_t){}
inline void ledcAttachPin(uint8_t,uint8_t){}
inline void ledcWrite(uint8_t,uint32_t){}
#define esp_task_wdt_init(t,p)
#define esp_task_wdt_add(h)
#define esp_task_wdt_reset()

class String{public:
    std::string _s;
    String(){}
    String(const char*s):_s(s?s:""){}
    String(const std::string&s):_s(s){}
    String(int v):_s(std::to_string(v)){}
    String(unsigned int v):_s(std::to_string(v)){}
    String(long v):_s(std::to_string(v)){}
    String(unsigned long v):_s(std::to_string(v)){}
    String(float v,int d=2){char b[32];snprintf(b,32,"%.*f",d,(double)v);_s=b;}
    String(double v,int d=2){char b[32];snprintf(b,32,"%.*f",d,v);_s=b;}
    const char*c_str()const{return _s.c_str();}
    size_t length()const{return _s.length();}
    bool isEmpty()const{return _s.empty();}
    String&operator+=(const String&r){_s+=r._s;return*this;}
    String&operator+=(const char*r){if(r)_s+=r;return*this;}
    String&operator+=(char c){_s+=c;return*this;}
    String operator+(const String&r)const{return String((_s+r._s).c_str());}
    String operator+(const char*r)const{return String((_s+(r?r:"")).c_str());}
    bool operator==(const char*r)const{return _s==(r?r:"");}
    bool operator==(const String&r)const{return _s==r._s;}
    bool operator!=(const char*r)const{return _s!=(r?r:"");}
    String substring(unsigned int f,unsigned int t=0xFFFF)const{if(t>=0xFFFF)return String(_s.substr(f).c_str());return String(_s.substr(f,t-f).c_str());}
    bool startsWith(const char*p)const{return _s.substr(0,strlen(p))==p;}
    int indexOf(char c,unsigned int from=0)const{auto p=_s.find(c,from);return p==std::string::npos?-1:(int)p;}
    int indexOf(const char* s,unsigned int from=0)const{if(!s)return -1;auto p=_s.find(s,from);return p==std::string::npos?-1:(int)p;}
    int indexOf(const String& s,unsigned int from=0)const{auto p=_s.find(s._s,from);return p==std::string::npos?-1:(int)p;}
    int toInt()const{return atoi(_s.c_str());}
    float toFloat()const{return(float)atof(_s.c_str());}
    void trim(){auto a=_s.find_first_not_of(" \t\r\n");auto b=_s.find_last_not_of(" \t\r\n");if(a==std::string::npos)_s="";else _s=_s.substr(a,b-a+1);}
    void toLowerCase(){for(auto&c:_s)c=tolower(c);}
};
inline String operator+(const char*l,const String&r){return String((std::string(l?l:"")+r._s).c_str());}

class SerialMock{public:
    void begin(unsigned long){}
    void println(const char*s=""){}
    void println(const String&s){}
    void println(int){}
    void print(const char*){}
    void printf(const char*,...){} // Silent in tests
};
inline SerialMock Serial;

// ---- Preferences (NVS with real in-memory storage) ----
class Preferences{
    static inline std::map<std::string,std::vector<uint8_t>> _store;
    static inline std::string _ns;
    std::string _key(const char*k)const{return _ns+"::"+k;}
public:
    bool begin(const char*ns,bool ro=false){_ns=ns?ns:"";return true;}
    void end(){}
    void clear(){auto p=_ns+"::";for(auto it=_store.begin();it!=_store.end();)if(it->first.substr(0,p.size())==p)it=_store.erase(it);else++it;}
    bool isKey(const char*k){return _store.count(_key(k))>0;}
    void putUChar(const char*k,uint8_t v){auto&d=_store[_key(k)];d={v};}
    uint8_t getUChar(const char*k,uint8_t def=0){auto it=_store.find(_key(k));return it!=_store.end()?it->second[0]:def;}
    void putUShort(const char*k,uint16_t v){auto&d=_store[_key(k)];d.resize(2);memcpy(d.data(),&v,2);}
    uint16_t getUShort(const char*k,uint16_t def=0){auto it=_store.find(_key(k));if(it==_store.end())return def;uint16_t v;memcpy(&v,it->second.data(),2);return v;}
    void putULong(const char*k,uint32_t v){auto&d=_store[_key(k)];d.resize(4);memcpy(d.data(),&v,4);}
    uint32_t getULong(const char*k,uint32_t def=0){auto it=_store.find(_key(k));if(it==_store.end())return def;uint32_t v;memcpy(&v,it->second.data(),4);return v;}
    void putFloat(const char*k,float v){auto&d=_store[_key(k)];d.resize(4);memcpy(d.data(),&v,4);}
    float getFloat(const char*k,float def=0){auto it=_store.find(_key(k));if(it==_store.end())return def;float v;memcpy(&v,it->second.data(),4);return v;}
    void putBool(const char*k,bool v){putUChar(k,v?1:0);}
    bool getBool(const char*k,bool def=false){return _store.count(_key(k))?(_store[_key(k)][0]!=0):def;}
    void putBytes(const char*k,const void*d,size_t l){auto&s=_store[_key(k)];s.resize(l);memcpy(s.data(),d,l);}
    size_t getBytes(const char*k,void*d,size_t l){auto it=_store.find(_key(k));if(it==_store.end())return 0;size_t n=std::min(l,it->second.size());memcpy(d,it->second.data(),n);return n;}
    void putString(const char*k,const char*v){auto&d=_store[_key(k)];std::string s(v?v:"");d.assign(s.begin(),s.end());}
    void putString(const char*k,const String&v){putString(k,v.c_str());}
    String getString(const char*k,const char*def=""){auto it=_store.find(_key(k));if(it==_store.end())return String(def);return String(std::string(it->second.begin(),it->second.end()).c_str());}
    String getString(const char*k,const String&def){return getString(k,def.c_str());}
    void remove(const char*k){_store.erase(_key(k));}
    static void resetAll(){_store.clear();}
};

// ---- Wire (I2C) ----
class TwoWire{public:
    void begin(int=-1,int=-1){}
    void beginTransmission(uint8_t){}
    uint8_t endTransmission(bool=true){return 0;}
    size_t write(uint8_t){return 1;}
    size_t write(const uint8_t*,size_t s){return s;}
    uint8_t requestFrom(uint8_t,uint8_t q,uint8_t=1){_avail=q;return q;}
    int available(){return _avail>0?_avail:0;}
    int read(){if(_avail>0){_avail--;return _mockData;}return-1;}
    void setClock(uint32_t){}
    uint8_t _mockData=0;int _avail=0;
};
inline TwoWire Wire;

// ---- Adafruit_BME280 ----
class Adafruit_BME280{public:
    enum sensor_mode{MODE_NORMAL=0,MODE_FORCED=1,MODE_SLEEP=2};
    enum sensor_sampling{SAMPLING_NONE=0,SAMPLING_X1=1,SAMPLING_X2=2,SAMPLING_X4=3,SAMPLING_X8=4,SAMPLING_X16=5};
    enum sensor_filter{FILTER_OFF=0,FILTER_X2=1,FILTER_X4=2};
    enum standby_duration{STANDBY_MS_0_5=0,STANDBY_MS_10=1,STANDBY_MS_20=2,STANDBY_MS_62_5=3,STANDBY_MS_125=4,STANDBY_MS_250=5,STANDBY_MS_500=6,STANDBY_MS_1000=7};
    void takeForcedMeasurement(){}
    float _t=25,_h=50,_p=1013.25;
    bool begin(uint8_t addr=0x76, TwoWire* w=nullptr){return true;}
    float readTemperature(){return _t;}
    float readHumidity(){return _h;}
    float readPressure(){return _p*100;} // Pa
    void setMock(float t,float h,float p){_t=t;_h=h;_p=p;}
    void setSampling(int=0,int=0,int=0,int=0,int=0,int=0){}
};

// ---- Adafruit_INA219 ----
// Registre global : permet d'injecter le courant depuis les tests sans accès
// à l'instance privée de SensorManager. MockHW::reset() le remet à 150mA.
namespace MockINA {
    inline float globalCurrent_mA = 150.0f;  // Valeur par défaut (pompe nominale)
    inline float globalVoltage_V  = 5.0f;
    inline void setGlobalCurrent(float c) { globalCurrent_mA = c; }
    inline void setGlobalVoltage(float v) { globalVoltage_V  = v; }
    inline void reset() { globalCurrent_mA = 150.0f; globalVoltage_V = 5.0f; }
}
class Adafruit_INA219{public:
    float _v=5,_c=150;
    bool begin(TwoWire* w=nullptr){return true;}
    float getBusVoltage_V(){return MockINA::globalVoltage_V;}
    float getCurrent_mA(){return MockINA::globalCurrent_mA;}
    float getPower_mW(){return MockINA::globalVoltage_V * MockINA::globalCurrent_mA;}
    void setMock(float v,float c){_v=v;_c=c; MockINA::globalVoltage_V=v; MockINA::globalCurrent_mA=c;}
    void setCalibration_32V_1A(){}
    void setCalibration_32V_2A(){}
    void setCalibration_16V_400mA(){}
};

// ---- ArduinoJson (functional subset) ----

// ---- ArduinoJson Mock (complete) ----
class JsonArray;
class JsonObject;

class JsonDocument {
    std::map<std::string,std::string> _d;
public:
    void clear(){_d.clear();}
    bool containsKey(const char*k)const{return _d.count(k)>0;}
    
    class Proxy {
        std::map<std::string,std::string>*_d;
        std::string _k;
    public:
        Proxy(std::map<std::string,std::string>*d,const std::string&k):_d(d),_k(k){}
        
        // Assignment
        Proxy& operator=(const char*v){(*_d)[_k]=v?v:"";return*this;}
        Proxy& operator=(const String&v){(*_d)[_k]=v._s;return*this;}
        Proxy& operator=(int v){(*_d)[_k]=std::to_string(v);return*this;}
        Proxy& operator=(uint8_t v){(*_d)[_k]=std::to_string(v);return*this;}
        Proxy& operator=(uint16_t v){(*_d)[_k]=std::to_string(v);return*this;}
        Proxy& operator=(uint32_t v){(*_d)[_k]=std::to_string(v);return*this;}
        Proxy& operator=(float v){char b[32];snprintf(b,32,"%.6f",(double)v);(*_d)[_k]=b;return*this;}
        Proxy& operator=(double v){char b[32];snprintf(b,32,"%.6f",v);(*_d)[_k]=b;return*this;}
        Proxy& operator=(bool v){(*_d)[_k]=v?"true":"false";return*this;}
        
        // Reading with default
        int operator|(int def)const{auto it=_d->find(_k);return it!=_d->end()?atoi(it->second.c_str()):def;}
        float operator|(float def)const{auto it=_d->find(_k);return it!=_d->end()?(float)atof(it->second.c_str()):def;}
        
        // Explicit conversion via as<T>()
        template<typename T> T as()const{
            auto it=_d->find(_k);
            std::string s=it!=_d->end()?it->second:"";
            if constexpr(std::is_same_v<T,float>)return(float)atof(s.c_str());
            else if constexpr(std::is_same_v<T,int>)return atoi(s.c_str());
            else if constexpr(std::is_same_v<T,uint8_t>)return(uint8_t)atoi(s.c_str());
            else if constexpr(std::is_same_v<T,uint16_t>)return(uint16_t)atoi(s.c_str());
            else if constexpr(std::is_same_v<T,uint32_t>)return(uint32_t)strtoul(s.c_str(),nullptr,10);
            else if constexpr(std::is_same_v<T,bool>)return s=="true"||s=="1";
            else if constexpr(std::is_same_v<T,const char*>){static std::string _tmp;_tmp=s;return _tmp.c_str();}
            else return T{};
        }
        
        // Implicit conversions for _config.field = doc["key"]
        operator uint8_t()const{auto it=_d->find(_k);return it!=_d->end()?(uint8_t)atoi(it->second.c_str()):0;}
        operator uint16_t()const{auto it=_d->find(_k);return it!=_d->end()?(uint16_t)atoi(it->second.c_str()):0;}
        operator uint32_t()const{auto it=_d->find(_k);return it!=_d->end()?(uint32_t)strtoul(it->second.c_str(),nullptr,10):0;}
        operator int()const{auto it=_d->find(_k);return it!=_d->end()?atoi(it->second.c_str()):0;}
        operator float()const{auto it=_d->find(_k);return it!=_d->end()?(float)atof(it->second.c_str()):0;}
        operator bool()const{auto it=_d->find(_k);return it!=_d->end()&&it->second!="false"&&it->second!="0"&&!it->second.empty();}
        
        // Nested access
        Proxy operator[](const char*k)const{return Proxy(_d,_k+"::"+k);}

        // containsKey on a sub-object (uses the flat _k::child encoding)
        bool containsKey(const char*k)const{return _d->count(_k+"::"+k)>0;}

        // to<JsonArray>() / to<JsonObject>() stubs
        template<typename T> T to(){return T{};}
    };
    
    Proxy operator[](const char*k){return Proxy(&_d,k);}
    const Proxy operator[](const char*k)const{return Proxy(const_cast<std::map<std::string,std::string>*>(&_d),k);}
    
    friend void serializeJson(const JsonDocument&doc,String&out);
};

class JsonArray{public:
    void add(float){}
    void add(int){}
    void add(const char*){}
    void add(const String&){}
    template<typename T> T add(){return T{};}
};

// JsonObject mock CONNECTED to the parent JsonDocument's _d map.
// Writes via obj["key"] = value are stored as _d["prefix::key"] = value
// so they appear in serializeJson() output. This matches the flat encoding
// that JsonDocument::Proxy already uses for nested access.
class JsonObject{
    std::map<std::string,std::string>* _d;
    std::string _prefix;
public:
    JsonObject() : _d(nullptr), _prefix("") {}
    JsonObject(std::map<std::string,std::string>* d, const std::string& p)
        : _d(d), _prefix(p) {}

    struct P2{
        std::map<std::string,std::string>* _d;
        std::string _key;
        P2(std::map<std::string,std::string>* d, const std::string& k) : _d(d), _key(k) {}
        P2& operator=(float v){if(_d){char b[32];snprintf(b,32,"%.6f",(double)v);(*_d)[_key]=b;}return*this;}
        P2& operator=(int v){if(_d)(*_d)[_key]=std::to_string(v);return*this;}
        P2& operator=(uint8_t v){if(_d)(*_d)[_key]=std::to_string(v);return*this;}
        P2& operator=(uint16_t v){if(_d)(*_d)[_key]=std::to_string(v);return*this;}
        P2& operator=(uint32_t v){if(_d)(*_d)[_key]=std::to_string(v);return*this;}
        P2& operator=(bool v){if(_d)(*_d)[_key]=v?"true":"false";return*this;}
        P2& operator=(const char* v){if(_d)(*_d)[_key]=v?v:"";return*this;}
        P2& operator=(const String& v){if(_d)(*_d)[_key]=v._s;return*this;}
    };
    P2 operator[](const char* k) {
        return P2(_d, _prefix.empty() ? std::string(k) : _prefix + "::" + k);
    }
};

// Specialization of Proxy::to<JsonObject>() — must be after JsonObject definition.
// Returns a JsonObject connected to the same _d, with the Proxy's key as prefix.
template<>
inline JsonObject JsonDocument::Proxy::to<JsonObject>() {
    return JsonObject(_d, _k);
}

struct DeserializationError{
    int code;
    operator bool()const{return code!=0;}
    const char*c_str()const{return code?"error":"ok";}
};

inline void serializeJson(const JsonDocument&d,String&o){
    std::string s="{";bool f=true;
    for(auto&p:d._d){if(!f)s+=",";f=false;s+="\""+p.first+"\":\""+p.second+"\"";}
    s+="}";o=String(s.c_str());
}

// ---- Parser JSON minimal pour deserializeJson ----
// Supporte : objets top-level, sous-objets 1 niveau, strings, nombres, booleans.
// Stockage plat via encoding prefix::key (cohérent avec JsonDocument::Proxy).
// Ne supporte PAS : arrays, sous-objets 2+ niveaux, escape sequences dans strings.

namespace JsonParser {

    // Avance l'index en sautant les espaces/tabs/newlines/CR
    inline void skipWs(const std::string& s, size_t& i) {
        while (i < s.size() && (s[i]==' '||s[i]=='\t'||s[i]=='\n'||s[i]=='\r')) ++i;
    }

    // Parse une string JSON délimitée par guillemets doubles.
    // Retourne false si la syntaxe est invalide.
    // Gestion minimale : pas d'escape sequences — suffisant pour les payloads internes.
    inline bool parseString(const std::string& s, size_t& i, std::string& out) {
        if (i >= s.size() || s[i] != '"') return false;
        ++i; // consomme le guillemet ouvrant
        out.clear();
        while (i < s.size() && s[i] != '"') {
            // Gestion basique du backslash : consommer sans interpréter
            if (s[i] == '\\' && i+1 < s.size()) { ++i; }
            out += s[i++];
        }
        if (i >= s.size()) return false; // guillemet fermant absent
        ++i; // consomme le guillemet fermant
        return true;
    }

    // Parse une valeur JSON (string, number, bool) dans le contexte du prefix donné.
    // Pour un sous-objet, appelle récursivement parseObject avec prefix = parentKey+"::".
    // Retourne false en cas d'erreur de syntaxe.
    inline bool parseValue(const std::string& s, size_t& i,
                           const std::string& fullKey,
                           std::map<std::string,std::string>& store);

    // Parse les paires key:value d'un objet JSON { ... }.
    // prefix : préfixe plat à ajouter devant chaque clé (ex: "network::").
    // Retourne false en cas d'erreur de syntaxe.
    inline bool parseObject(const std::string& s, size_t& i,
                            const std::string& prefix,
                            std::map<std::string,std::string>& store) {
        if (i >= s.size() || s[i] != '{') return false;
        ++i; // consomme '{'
        skipWs(s, i);
        if (i < s.size() && s[i] == '}') { ++i; return true; } // objet vide

        while (i < s.size()) {
            skipWs(s, i);
            // Parse la clé
            std::string key;
            if (!parseString(s, i, key)) return false;
            skipWs(s, i);
            if (i >= s.size() || s[i] != ':') return false;
            ++i; // consomme ':'
            skipWs(s, i);
            // Parse la valeur avec le préfixe complet
            std::string fullKey = prefix + key;
            if (!parseValue(s, i, fullKey, store)) return false;
            skipWs(s, i);
            if (i < s.size() && s[i] == ',') { ++i; continue; }
            if (i < s.size() && s[i] == '}') { ++i; return true; }
            return false; // caractère inattendu
        }
        return false; // '}' absent
    }

    inline bool parseValue(const std::string& s, size_t& i,
                           const std::string& fullKey,
                           std::map<std::string,std::string>& store) {
        if (i >= s.size()) return false;

        if (s[i] == '"') {
            // Valeur string
            std::string val;
            if (!parseString(s, i, val)) return false;
            store[fullKey] = val;
            return true;
        }

        if (s[i] == '{') {
            // Sous-objet : parse récursif avec prefix = fullKey + "::"
            // On stocke aussi une entrée sentinelle pour que containsKey(fullKey) soit vrai
            store[fullKey] = "__object__";
            return parseObject(s, i, fullKey + "::", store);
        }

        if (s[i] == 't' && s.substr(i, 4) == "true") {
            store[fullKey] = "true"; i += 4; return true;
        }
        if (s[i] == 'f' && s.substr(i, 5) == "false") {
            store[fullKey] = "false"; i += 5; return true;
        }
        if (s[i] == 'n' && s.substr(i, 4) == "null") {
            store[fullKey] = ""; i += 4; return true;
        }

        // Nombre : integer ou float, éventuellement négatif
        if (s[i] == '-' || (s[i] >= '0' && s[i] <= '9')) {
            size_t start = i;
            if (s[i] == '-') ++i;
            while (i < s.size() && (s[i] >= '0' && s[i] <= '9')) ++i;
            if (i < s.size() && s[i] == '.') {
                ++i;
                while (i < s.size() && (s[i] >= '0' && s[i] <= '9')) ++i;
            }
            if (i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
                ++i;
                if (i < s.size() && (s[i] == '+' || s[i] == '-')) ++i;
                while (i < s.size() && (s[i] >= '0' && s[i] <= '9')) ++i;
            }
            store[fullKey] = s.substr(start, i - start);
            return true;
        }

        return false; // type non reconnu
    }

} // namespace JsonParser

inline DeserializationError deserializeJson(JsonDocument&d,const String&in){
    d.clear();
    const std::string& s = in._s;
    if (s.empty()) return {1};

    // Trouver le premier caractère non-whitespace
    size_t i = 0;
    while (i < s.size() && (s[i]==' '||s[i]=='\t'||s[i]=='\n'||s[i]=='\r')) ++i;
    if (i >= s.size() || s[i] != '{') return {1};

    // Accès à la map interne via friend
    std::map<std::string,std::string> store;
    bool ok = JsonParser::parseObject(s, i, "", store);
    if (!ok) return {1};

    // Injecter les entrées parsées dans le document
    for (auto& kv : store) {
        d[kv.first.c_str()] = kv.second.c_str();
    }
    return {0};
}

// ---- getLocalTime ----
namespace MockTime{
    inline struct tm t={0,30,14,15,7,125,0,0,0}; // 14:30 Aug 15 2025
    inline void set(int h,int m,int mon,int day=15){t.tm_hour=h;t.tm_min=m;t.tm_mon=mon;t.tm_mday=day;}
}
inline bool getLocalTime(struct tm*t,uint32_t=0){if(!t)return false;*t=MockTime::t;return true;}

namespace ESP_mock{inline bool restarted=false;inline void restart(){restarted=true;}}
#define ESP ESP_mock
class WiFiMock{public:int8_t RSSI(){return-55;}};
inline WiFiMock WiFi;
inline void analogReadResolution(uint8_t){}
inline void analogSetAttenuation(uint8_t){}
#define ADC_11db 3
namespace Adafruit_BME280_ns { enum { MODE_NORMAL=0,SAMPLING_X1=1,SAMPLING_X2=2,FILTER_OFF=0,STANDBY_MS_1000=0 }; }
