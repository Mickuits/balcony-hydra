#pragma once
#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <setjmp.h>

static int _u_run = 0;
static int _u_pass = 0;
static int _u_fail = 0;
static const char* _u_name = "";
static jmp_buf _u_jmp;
static bool _u_failed_flag = false;

#define UNITY_BEGIN() do { \
    _u_run=0;_u_pass=0;_u_fail=0; \
    printf("\n========================================\n"); \
    printf("  BALCONY HYDRA v4 — TESTS FONCTIONNELS\n"); \
    printf("========================================\n\n"); \
} while(0)

#define UNITY_END() do { \
    printf("\n========================================\n"); \
    printf("  RESULTATS: %d/%d passes", _u_pass, _u_run); \
    if(_u_fail>0)printf(", \033[31m%d ECHECS\033[0m",_u_fail); \
    else printf(" \033[32m✓ TOUT OK\033[0m"); \
    printf("\n========================================\n"); \
    return _u_fail; \
} while(0)

#define RUN_TEST(func) do { \
    _u_name=#func; _u_run++; _u_failed_flag=false; \
    setUp(); \
    if(setjmp(_u_jmp)==0){func();} \
    tearDown(); \
    if(!_u_failed_flag){printf("  \033[32mOK\033[0m   %s\n",_u_name);_u_pass++;} \
} while(0)

#define _U_FAIL(msg,line) do { \
    printf("  \033[31mFAIL\033[0m %s (line %d): %s\n",_u_name,line,msg); \
    _u_fail++;_u_failed_flag=true;longjmp(_u_jmp,1); \
} while(0)

#define TEST_ASSERT_TRUE(c) do{if(!(c)){_U_FAIL("expected TRUE",__LINE__);}}while(0)
#define TEST_ASSERT_FALSE(c) do{if(c){_U_FAIL("expected FALSE",__LINE__);}}while(0)

#define TEST_ASSERT_EQUAL(e,a) do{ \
    if((long long)(e)!=(long long)(a)){ \
        char _b[128];snprintf(_b,128,"expected %lld, got %lld",(long long)(e),(long long)(a)); \
        _U_FAIL(_b,__LINE__);}}while(0)

#define TEST_ASSERT_EQUAL_STRING(e,a) do{ \
    if(strcmp(e,a)!=0){char _b[128];snprintf(_b,128,"expected \"%s\", got \"%s\"",e,a);_U_FAIL(_b,__LINE__);}}while(0)

#define TEST_ASSERT_FLOAT_WITHIN(d,e,a) do{ \
    if(fabs((double)(e)-(double)(a))>(double)(d)){ \
        char _b[128];snprintf(_b,128,"expected %.4f +/-%.4f, got %.4f",(double)(e),(double)(d),(double)(a)); \
        _U_FAIL(_b,__LINE__);}}while(0)

#define TEST_ASSERT_GREATER_THAN(t,a) do{if((long long)(a)<=(long long)(t)){ \
    char _b[128];snprintf(_b,128,"expected >%lld, got %lld",(long long)(t),(long long)(a));_U_FAIL(_b,__LINE__);}}while(0)

#define TEST_ASSERT_LESS_THAN(t,a) do{if((long long)(a)>=(long long)(t)){ \
    char _b[128];snprintf(_b,128,"expected <%lld, got %lld",(long long)(t),(long long)(a));_U_FAIL(_b,__LINE__);}}while(0)

#define TEST_ASSERT_LESS_OR_EQUAL(t,a) do{if((long long)(a)>(long long)(t)){ \
    char _b[128];snprintf(_b,128,"expected <=%lld, got %lld",(long long)(t),(long long)(a));_U_FAIL(_b,__LINE__);}}while(0)

#define TEST_ASSERT_GREATER_OR_EQUAL(t,a) do{if((long long)(a)<(long long)(t)){ \
    char _b[128];snprintf(_b,128,"expected >=%lld, got %lld",(long long)(t),(long long)(a));_U_FAIL(_b,__LINE__);}}while(0)

#ifndef ARDUINO
#define NATIVE_TEST_RUNNER int main(){return setup();}
#endif
