import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL || 'https://dev.dayone01.site';
const USER_EMAIL = __ENV.USER_EMAIL || 'onurivit01@gmail.com';

// 테스트 PDF 파일 (k6 init 단계에서 1회 로드)
const testFile = open('/Users/sanghyun/Downloads/cse-101-syllabus-f16.pdf', 'b');

// 커스텀 메트릭
const uploadLatency = new Trend('upload_latency', true);
const uploadSuccess = new Rate('upload_success');
const uploadCount = new Counter('upload_count');

export const options = {
  scenarios: {
    // 시나리오 1: 점진적 동시 업로드
    gradual_upload: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 3 },   // 3명 동시 업로드
        { duration: '2m', target: 3 },    // 유지 (Gemini 응답 대기 관찰)
        { duration: '30s', target: 5 },   // 5명으로 증가
        { duration: '2m', target: 5 },    // 유지
        { duration: '30s', target: 10 },  // 10명으로 증가
        { duration: '2m', target: 10 },   // 유지 (여기서 Gemini 지연 폭발 예상)
        { duration: '30s', target: 0 },   // 감소
      ],
    },
  },
  thresholds: {
    // Gemini p95가 62초였으니 넉넉하게
    upload_latency: ['p(50)<30000', 'p(95)<120000'],
    http_req_failed: ['rate<0.50'],
  },
};

export default function () {
  // 쿠키 세팅 (로그인 우회)
  const jar = http.cookieJar();
  jar.set(BASE_URL, 'user_email', USER_EMAIL);

  group('upload_pipeline', () => {
    const res = http.post(
      `${BASE_URL}/api/schedule/upload`,
      {
        uploaded_file: http.file(testFile, 'cse-101-syllabus-f16.pdf', 'application/pdf'),
        event_color: '1',
      },
      {
        timeout: '180s',  // Gemini가 60초+ 걸릴 수 있으니 넉넉하게
      }
    );

    check(res, {
      'upload 200': (r) => r.status === 200,
      'upload success': (r) => {
        try {
          return JSON.parse(r.body).status === 'success';
        } catch {
          return false;
        }
      },
    });

    uploadLatency.add(res.timings.duration);
    uploadSuccess.add(res.status === 200);
    uploadCount.add(1);

    // 응답 로그 (디버깅용)
    if (res.status !== 200) {
      console.log(`❌ VU ${__VU} | ${res.status} | ${res.body}`);
    } else {
      try {
        const body = JSON.parse(res.body);
        console.log(`✅ VU ${__VU} | ${body.count} events | ${res.timings.duration}ms`);
      } catch {
        console.log(`✅ VU ${__VU} | ${res.timings.duration}ms`);
      }
    }
  });

  // 업로드 간 대기 (Google API Rate Limit 고려)
  sleep(Math.random() * 3 + 2);  // 2~5초 랜덤 대기
}
