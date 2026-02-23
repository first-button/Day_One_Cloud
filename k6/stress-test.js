import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL || 'https://dev.dayone01.site';

const staticLatency = new Trend('static_latency', true);
const apiLatency = new Trend('api_latency', true);
const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // 100명까지 증가
    { duration: '1m', target: 100 },   // 유지
    { duration: '1m', target: 500 },   // 500명까지 증가
    { duration: '1m', target: 500 },   // 유지
    { duration: '1m', target: 1000 },  // 1000명까지 증가
    { duration: '1m', target: 1000 },  // 유지
    { duration: '30s', target: 0 },    // 감소
  ],
  thresholds: {
    http_req_duration: [{ threshold: 'p(95)<5000', abortOnFail: true }],
    http_req_failed: [{ threshold: 'rate<0.30', abortOnFail: true }],
  },
};

export default function () {
  // 정적 리소스 (prod: CloudFront 캐시)
  group('static', () => {
    const mainPage = http.get(`${BASE_URL}/`);
    check(mainPage, {
      'main page 200': (r) => r.status === 200,
    });
    staticLatency.add(mainPage.timings.duration);
    errorRate.add(mainPage.status !== 200);
  });

  sleep(0.2);

  // API (CloudFront 패스스루 → Backend 직통)
  group('api', () => {
    const login = http.get(`${BASE_URL}/api/auth/login`, { redirects: 0 });
    check(login, {
      'api responds 200': (r) => r.status === 200,
    });
    apiLatency.add(login.timings.duration);
    errorRate.add(login.status !== 200);
  });

  sleep(Math.random() * 0.3 + 0.2);
}
