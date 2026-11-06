# @kr-pro-labs/clonevibe-mcp

[**English**](./README.md) | [**한국어 (Korean)**](./README.ko.md)

[![CI](https://github.com/KR-PRO-Labs/clonevibe-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/KR-PRO-Labs/clonevibe-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0.4-7c3aed)](https://modelcontextprotocol.io/)

**바이브 코딩(Vibe Coding)을 위한 외과적 AST 기능 슬라이서, 무의존성(Zero-Dep) 카멜레온 코드 이식기 & 1:1 골든 패리티 검증 MCP 서버.**

바이브 코딩 중 거대한 외부 레퍼런스(수만 줄 규모의 GitHub 저장소, `npm:`/`pypi:`/`cargo:` 패키지, 또는 난독화/압축된 단일 줄 JS 번들)에서 특정 알고리즘, 마크다운 파서, 재시도 스케줄러, 물리 연산 루틴, 상태 머신 등 **핵심 엔진만 깔끔하게 추출해 내 프로젝트에 이식**해야 할 때가 많습니다. 전체 저장소를 클론하거나 무거운 서드파티 의존성 트리를 설치하면 호스트 프로젝트가 오염됩니다.

**`clonevibe-mcp`**는 목표 기능의 진입점(Entrypoint)으로부터 **최소 전이적 호출/타입 그래프(Transitive AST Closure)**만 정밀 추출해 불필요한 보일러플레이트를 80%~98% 제거하고, 외부 서드파티 패키지를 표준 라이브러리 기반 인라인 마이크로 심(Zero-Dep Micro-Shim)으로 치환하며, 타깃 프로젝트의 언어·모듈·네이밍·포맷 컨벤션에 맞춰 자동 변환한 뒤 **1:1 골든 입출력 동등성(Golden Parity)**을 기계적으로 입증합니다.

---

## 핵심 파이프라인 (6-Stage Workflow)

1. **`ingest_reference`**: GitHub URL, 로컬 경로, 패키지 레지스트리 스펙(`npm:`, `pypi:`, `cargo:`), 인라인 파일 맵, 단일 줄 압축 JS 번들을 정규화하여 `ReferenceSnapshot`으로 인덱싱합니다.
2. **`locate_feature_entrypoints`**: 자연어 기능 쿼리와 호출 그래프 중심성(Centrality)을 결합해 핵심 엔진 진입점 심볼을 랭킹합니다.
3. **`slice_engine_graph`**: 진입점으로부터 BFS 전이적 클로저를 계산해 죽은 코드와 미사용 서드파티 임포트를 제거하고 인라인 마이크로 심을 매핑합니다.
4. **`profile_target_vibe`**: 타깃 호스트 프로젝트의 언어(`TypeScript`, `JavaScript`, `Python`, `Rust`, `Go`), 모듈 시스템, 네이밍 규칙(`camelCase`, `snake_case`, `PascalCase`), 들여쓰기, 따옴표, 세미콜론, 에러 처리 관용구를 자동 프로파일링합니다.
5. **`synthesize_chameleon_graft`**: 외부 런타임 의존성 0개(`externalDepCount === 0`)의 카멜레온 이식 모듈과 클린룸 알고리즘 블루프린트(Blueprint IR)를 합성합니다.
6. **`verify_engine_parity`**: 빈 입력, 경계값, 유니코드/한글/이모지, 비정상 페이로드, 결정론적 시드 등 5대 골든 벡터를 통해 1:1 동등성을 검증하고 즉시 실행 가능한 단위 테스트 스위트를 생성합니다.

---

## 설치 및 빌드

```bash
git clone https://github.com/KR-PRO-Labs/clonevibe-mcp.git
cd clonevibe-mcp
npm install
npm run build
npm test
```

## 라이선스

MIT © [KR-PRO-Labs](https://github.com/KR-PRO-Labs) & [Julian Vane (`@goooem`)](https://github.com/goooem)
