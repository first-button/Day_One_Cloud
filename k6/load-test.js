import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'https://dev.dayone01.site';

export const options = {
  stages: [
    { duration: '30s', target: 50 },    // 50명까지 증가
    { duration: '1m', target: 50 },     // 50명 유지
    { duration: '30s', target: 100 },   // 100명까지 증가
    { duration: '1m', target: 100 },    // 100명 유지
    { duration: '30s', target: 200 },   // 200명 스파이크
    { duration: '1m', target: 200 },    // 200명 유지
    { duration: '30s', target: 0 },     // 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const mainPage = http.get(`${BASE_URL}/`);
  check(mainPage, {
    'main page 200': (r) => r.status === 200,
  });

  sleep(0.1);

  http.get(`${BASE_URL}/assets/index.js`);
  http.get(`${BASE_URL}/assets/index.css`);

  sleep(0.1);

  const login = http.get(`${BASE_URL}/api/login`, { redirects: 0 });
  check(login, {
    'api login responds': (r) => r.status === 200 || r.status === 307,
  });

  sleep(Math.random() * 0.3 + 0.1); // 0.1~0.4초 랜덤 대기
}
