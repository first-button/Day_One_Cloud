import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL || 'https://dayone01.site';
const USER_EMAIL = __ENV.USER_EMAIL || 'onurivit01@gmail.com';

const testFile = open('/Users/sanghyun/Downloads/cse-101-syllabus-f16.pdf', 'b');

// 커스텀 메트릭
const uploadLatency = new Trend('upload_latency', true);
const apiAvailable = new Rate('api_available');

export const options = {
  scenarios: {
    // 시나리오 1: 업로드 동시 요청 (동기 처리, Redis 없음)
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
    upload_latency: ['p(95)<180000'],
    api_available: ['rate>0.95'],
  },
};

// 시나리오 1: 동기 업로드 (응답 = 처리 완료)
export function uploadTest() {
  const jar = http.cookieJar();
  jar.set(BASE_URL, 'user_email', USER_EMAIL);

  group('upload_sync', () => {
    const res = http.post(
      `${BASE_URL}/api/schedule/upload`,
      {
        uploaded_file: http.file(testFile, 'cse-101-syllabus-f16.pdf', 'application/pdf'),
        event_color: '1',
      },
      { timeout: '180s' }
    );

    uploadLatency.add(res.timings.duration);

    check(res, {
      'upload 200': (r) => r.status === 200,
    });

    if (res.status !== 200) {
      console.log(`❌ VU ${__VU} | ${res.status} | ${res.timings.duration}ms`);
    } else {
      console.log(`✅ VU ${__VU} | ${res.timings.duration}ms`);
    }
  });

  sleep(Math.random() * 2 + 1);
}

// 시나리오 2: API 가용성 체크
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
