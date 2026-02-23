import http from 'k6/http';
import { check, sleep } from 'k6';

// Target URL - change to prod when needed
const BASE_URL = __ENV.TARGET_URL || 'https://dev.dayone01.site';

export const options = {
  stages: [
    // Ramp up
    { duration: '30s', target: 10 },   // 30초 동안 10명까지 증가
    { duration: '1m', target: 10 },    // 1분 동안 10명 유지
    // Spike
    { duration: '30s', target: 50 },   // 30초 동안 50명까지 증가
    { duration: '1m', target: 50 },    // 1분 동안 50명 유지
    // Ramp down
    { duration: '30s', target: 0 },    // 30초 동안 0명으로 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% 요청이 2초 이내
    http_req_failed: ['rate<0.05'],     // 에러율 5% 미만
  },
};

export default function () {
  // 1. Main page load
  const mainPage = http.get(`${BASE_URL}/`);
  check(mainPage, {
    'main page 200': (r) => r.status === 200,
  });

  sleep(1);

  // 2. Static assets (simulating SPA load)
  http.get(`${BASE_URL}/assets/index.js`);
  http.get(`${BASE_URL}/assets/index.css`);

  sleep(1);

  // 3. API login page (OAuth redirect check)
  const login = http.get(`${BASE_URL}/api/login`, { redirects: 0 });
  check(login, {
    'api login responds': (r) => r.status === 200 || r.status === 307,
  });

  sleep(Math.random() * 3 + 1); // 1~4초 랜덤 대기 (실제 사용자처럼)
}
