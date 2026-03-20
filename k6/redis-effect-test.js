import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL || 'https://dev.dayone01.site';
const USER_EMAIL = __ENV.USER_EMAIL || 'onurivit01@gmail.com';

const testFile = open('/Users/sanghyun/Downloads/cse-101-syllabus-f16.pdf', 'b');

// 커스텀 메트릭
const apiResponseTime = new Trend('api_response_time', true);   // API 응답 시간 (접수까지)
const totalProcessTime = new Trend('total_process_time', true); // 전체 처리 시간 (완료까지)
const apiAvailable = new Rate('api_available');                  // API 가용성

export const options = {
  scenarios: {
    // 시나리오 1: 업로드 동시 요청 (Redis 효과 측정)
    upload_flood: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 5 },
        { duration: '2m', target: 5 },
        { duration: '15s', target: 10 },
        { duration: '2m', target: 10 },
        { duration: '15s', target: 0 },
      ],
      exec: 'uploadTest',
    },
    // 시나리오 2: 업로드 폭주 중 API 가용성 확인
    api_health: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 5,
      exec: 'healthCheck',
    },
  },
  thresholds: {
    api_response_time: ['p(95)<3000'],     // API 응답 95%가 3초 이내
    total_process_time: ['p(95)<180000'],
    api_available: ['rate>0.95'],           // API 가용성 95% 이상
  },
};

// 시나리오 1: 업로드 + polling으로 전체 시간 측정
export function uploadTest() {
  const jar = http.cookieJar();
  jar.set(BASE_URL, 'user_email', USER_EMAIL);

  group('upload_with_polling', () => {
    const startTime = Date.now();

    // 1. 업로드 요청 (API 응답 시간 측정)
    const res = http.post(
      `${BASE_URL}/api/schedule/upload`,
      {
        uploaded_file: http.file(testFile, 'cse-101-syllabus-f16.pdf', 'application/pdf'),
        event_color: '1',
      },
      { timeout: '30s' }
    );

    apiResponseTime.add(res.timings.duration);

    const uploadOk = check(res, {
      'upload accepted': (r) => r.status === 200,
    });

    if (!uploadOk) {
      console.log(`❌ VU ${__VU} | upload failed | ${res.status}`);
      return;
    }

    let taskId;
    try {
      taskId = JSON.parse(res.body).task_id;
    } catch {
      console.log(`❌ VU ${__VU} | no task_id`);
      return;
    }

    console.log(`📨 VU ${__VU} | accepted in ${res.timings.duration}ms | task: ${taskId}`);

    // 2. Polling으로 완료 대기
    let done = false;
    while (!done) {
      sleep(2);
      const statusRes = http.get(
        `${BASE_URL}/api/schedule/upload/status/${taskId}`,
        { timeout: '10s' }
      );

      try {
        const data = JSON.parse(statusRes.body);
        if (data.status !== 'processing') {
          done = true;
          const elapsed = Date.now() - startTime;
          totalProcessTime.add(elapsed);

          if (data.status === 'success') {
            console.log(`✅ VU ${__VU} | done in ${elapsed}ms | ${data.count} events`);
          } else {
            console.log(`❌ VU ${__VU} | failed: ${data.message}`);
          }
        }
      } catch {
        done = true;
      }
    }
  });

  sleep(Math.random() * 2 + 1);
}

// 시나리오 2: API 가용성 체크 (업로드 폭주 중에도 응답하는지)
export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/auth/login`, { timeout: '5s' });

  const ok = check(res, {
    'login API responds': (r) => r.status === 200,
  });

  apiAvailable.add(ok ? 1 : 0);

  if (!ok) {
    console.log(`⚠️ API unavailable! status: ${res.status}`);
  }
}
