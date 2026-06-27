import { RESOURCES, CHARACTERS, PHASES, BRANCHES, LOOP_SECONDS, BALANCE, ENDINGS, TUTORIAL_STEPS, BRANCH_CHOICE_RIDERS, BRANCH_AFTERMATH_RIDERS, STORY_BEATS, BEAT_REPEAT_PREFIXES, BRANCH_REPEAT_PREFIXES, phaseAt } from './data.js?v=7';

const VISIBLE_BRANCH_IDS = ['support_yun', 'signal_lantern', 'memory_knot'];
const CHOICE_PHASE_IDS = new Set(['B', 'D']);

const els = {
  loopCount: document.getElementById('loop-count'),
  rift: document.querySelector('.rift'),
  riftFill: document.getElementById('rift-fill'),
  riftValue: document.getElementById('rift-value'),
  charPanel: document.getElementById('char-panel'),
  stage: document.getElementById('stage'),
  loopClock: document.getElementById('loop-clock'),
  phaseName: document.getElementById('phase-name'),
  timelineTrack: document.getElementById('timeline-track'),
  timelineCursor: document.getElementById('timeline-cursor'),
  resourceHud: document.getElementById('resource-hud'),
  branchCard: document.querySelector('.branch-card'),
  visionCard: document.querySelector('.vision-card'),
  observationLog: document.getElementById('observation-log'),
  visionPreview: document.getElementById('vision-preview'),
  visionCost: document.getElementById('vision-cost'),
  branchButtons: document.getElementById('branch-buttons'),
  branchStatus: document.getElementById('branch-status'),
  choiceToast: document.getElementById('choice-toast'),
  branchLinkCue: document.getElementById('branch-link-cue'),
  carryoverSummary: document.getElementById('carryover-summary'),
  btnStart: document.getElementById('btn-start'),
  btnSecondary: document.getElementById('btn-secondary'),
  btnPause: document.getElementById('btn-pause'),
  btnReset: document.getElementById('btn-reset'),
  btnVision: document.getElementById('btn-vision'),
  speedSelect: document.getElementById('speed-select'),
  escapeCard: document.getElementById('escape-card'),
  storyBeat: document.getElementById('story-beat'),
  btnEscape: document.getElementById('btn-escape'),
  tutorialOverlay: document.getElementById('tutorial-overlay'),
  tutorialIcon: document.getElementById('tutorial-icon'),
  tutorialStep: document.getElementById('tutorial-step'),
  tutorialTitle: document.getElementById('tutorial-title'),
  tutorialBody: document.getElementById('tutorial-body'),
  btnTutorialNext: document.getElementById('btn-tutorial-next'),
  btnTutorialSkip: document.getElementById('btn-tutorial-skip'),
  endingOverlay: document.getElementById('ending-overlay'),
  endingCard: document.getElementById('ending-card'),
  endingTag: document.getElementById('ending-tag'),
  endingTitle: document.getElementById('ending-title'),
  endingAtmos: document.getElementById('ending-atmos'),
  endingLine: document.getElementById('ending-line'),
  endingSummary: document.getElementById('ending-summary'),
  endingHint: document.getElementById('ending-hint'),
  btnEndingRestart: document.getElementById('btn-ending-restart'),
  btnCodex: document.getElementById('btn-codex'),
  codexCount: document.getElementById('codex-count'),
  codexOverlay: document.getElementById('codex-overlay'),
  codexSub: document.getElementById('codex-sub'),
  codexList: document.getElementById('codex-list'),
  codexProgress: document.getElementById('codex-progress'),
  btnCodexClose: document.getElementById('btn-codex-close'),
};

function makeResourceState() {
  return Object.fromEntries(RESOURCES.map((r) => [r.id, r.initial]));
}

function makeCharacters(source = CHARACTERS) {
  return source.map((c) => ({ ...c }));
}

const state = {
  running: false,
  loop: 1,
  time: LOOP_SECONDS,
  lastTick: performance.now(),
  lastPhaseId: phaseAt(0).id,
  speed: Number(els.speedSelect.value),
  resources: makeResourceState(),
  characters: makeCharacters(),
  rift: 0,
  observedThisLoop: false,
  disasterTriggered: false,
  ended: false,
  observationLog: [
    { text: '루프 1회차 시작: 예지 관측이 가능한 상태로 진입했다.', tone: '' },
  ],
  branchMemory: [],
  branchCounts: {},
  branchLocked: false,
  currentBranchId: null,
  choicePhaseId: null,
  branchAftermathTriggered: false,
  phaseEntryAt: 0,
  phaseEntryCue: '',
  expandedChars: new Set(),
  runs: 0,        // 이전에 완료한 고리(엔딩 도달) 횟수 — 회차 보상/진행도 표시
  runBonus: 0,    // 이번 시작에 적용된 예지 보너스
};

// 자원 값이 바뀔 때만 HUD 숫자에 bump 피드백을 주기 위한 직전 값 캐시
const lastResVals = {};
let choiceToastTimer = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${pad(mm)}:${pad(ss)}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function averageTrust(chars = state.characters) {
  if (!chars.length) return 0;
  return Math.round(chars.reduce((sum, c) => sum + c.trust, 0) / chars.length);
}

const DANGER_WORDS = ['이탈', '압사', '붕괴', '벌어졌', '흩어', '바닥', '커졌', '못했다', '무너', '흔들'];
const GOOD_WORDS = ['숙련', '기억 조각', '회복', '되돌아', '줄었', '줄고', '함께', '선명', '해금'];

function logTone(text) {
  if (DANGER_WORDS.some((w) => text.includes(w))) return 'danger';
  if (GOOD_WORDS.some((w) => text.includes(w))) return 'good';
  return '';
}

function pushLog(text, tone = logTone(text)) {
  state.observationLog.unshift({ text, tone });
  state.observationLog = state.observationLog.slice(0, 5);
  renderLog();
}

function showChoiceToast(message, tone = 'good') {
  if (!els.choiceToast) return;
  if (choiceToastTimer) clearTimeout(choiceToastTimer);
  els.choiceToast.hidden = false;
  els.choiceToast.className = `choice-toast tone-${tone}`;
  els.choiceToast.textContent = message;
  choiceToastTimer = setTimeout(() => {
    if (els.choiceToast) els.choiceToast.hidden = true;
  }, 6000);
}

function refreshPrimaryActionLabel() {
  if (!els.btnStart) return;
  const currentPhase = phaseAt(LOOP_SECONDS - state.time);
  if (currentPhase.id === 'A') {
    els.btnStart.textContent = '다음 장면';
  } else if (currentPhase.id === 'B') {
    els.btnStart.textContent = state.branchLocked ? '여파 보기' : '다음 장면';
  } else if (currentPhase.id === 'C') {
    els.btnStart.textContent = '다음 장면';
  } else {
    els.btnStart.textContent = state.branchLocked ? '여파 정리' : '다음 루프';
  }
}

function refreshSecondaryActionLabel() {
  if (!els.btnSecondary) return;
  const app = document.getElementById('app');
  els.btnSecondary.textContent = app?.classList.contains('secondary-open') ? '기록 닫기' : '기록';
}

function renderBranchMemory() {
  const el = els.branchMemory;
  if (!el) return;
  const recent = state.branchMemory.slice(-3);
  el.textContent = recent.length
    ? `분기 메모리 — ${recent.join(' · ')}`
    : '분기 메모리 — 아직 선택 없음';
}

function renderBranchLinkCue() {
  const el = els.branchLinkCue;
  if (!el) return;
  const branch = BRANCHES.find((b) => b.id === state.currentBranchId);
  if (!branch) {
    el.textContent = '연결선 — 아직 열린 갈래 없음';
    return;
  }

  const linkMap = {
    support_yun: '윤도현 지원 ↔ 이세아 보호: 사람을 살리면 기억이 남고, 기억이 남으면 다음 개입이 빨라진다.',
    route_anchor: '윤도현 경로 고정 ↔ 예지 관측: 방금 연 길을 다시 잡아 다음 여파 국면의 구조를 더 단단히 묶는다.',
    signal_lantern: '서가람 신호 고정 ↔ 윤도현 경로 고정: 예지가 경로를 비추고, 경로가 예지를 다시 살린다.',
    protect_seah: '이세아 보호 ↔ 윤도현 지원: 기억을 지키면 구조가 또렷해지고, 구조가 또렷해지면 길이 열리기 쉽다.',
    memory_knot: '이세아 기억 매듭 ↔ 기억 보존: 이름을 더 단단히 묶을수록 다음 루프에서 같은 길을 더 쉽게 읽는다.',
    triage_chain: '윤도현 이세아 동시 구조 ↔ 서가람 신호 고정: 구조와 기억이 같이 묶일수록 다음 장면의 좌표가 선명해진다.',
    conserve_foresight: '예지 보존 ↔ 두 분기: 지금 아낀 만큼 여파 국면의 대가가 커지고, 다음 루프의 선택 폭은 더 좁아진다.',
    foresight_burn: '서가람 예지 집중 ↔ 서가람 신호 고정: 예지를 태울수록 기억이 쌓이고, 쌓인 기억은 다음 루프의 예지를 아끼는 발판이 된다.',
    vanguard_push: '윤도현 선두 이끌기 ↔ 윤도현 밀어주기: 선두로 열어낸 길에 물자까지 더하면 병목이 두 겹으로 풀린다.',
    memory_shield: '이세아 기억 방패 ↔ 이세아 기억 매듭: 기억을 불살라 신뢰를 얻고, 매듭으로 기억을 다시 묶으면 잃은 만큼이 채워진다.',
    vision_relay: '서가람 예지 전달 ↔ 이세아 보호: 예지가 기억 위에 얹힐수록 다음 루프의 단서가 더 빠르게 모인다.',
    relay_command: '서가람 원격 지휘 ↔ 윤도현 선두 이끌기: 서가람의 예지가 윤도현을 이끌고, 윤도현의 선두가 다음 예지를 위한 공간을 만든다.',
  };
  const count = state.branchCounts[branch.id] ?? 0;
  const depth = count > 0 ? ` · ${masteryLabel(count)} 누적` : '';
  const loopEcho = state.loop > 1 ? ` · ${state.loop}회차 누적` : '';
  el.textContent = `연결선 — ${linkMap[branch.id] ?? '이 분기는 여파 국면과 다음 루프에 여파를 남긴다.'}${depth}${loopEcho}`;
}

function buildBranchButtons() {
  if (!els.branchButtons) return;
  els.branchButtons.innerHTML = '';
  BRANCHES.filter((branch) => VISIBLE_BRANCH_IDS.includes(branch.id)).forEach((branch) => {
    const btn = document.createElement('button');
    btn.className = 'branch-btn';
    btn.type = 'button';
    btn.dataset.branchId = branch.id;
    btn.textContent = branch.label;
    btn.title = branch.desc;
    btn.addEventListener('click', () => chooseBranch(branch.id));
    els.branchButtons.appendChild(btn);
  });
}

function updateBranchPanel() {
  const currentPhase = phaseAt(LOOP_SECONDS - state.time);
  const inChoice = CHOICE_PHASE_IDS.has(currentPhase.id);
  const hasChoice = state.choicePhaseId === currentPhase.id;
  const elapsed = LOOP_SECONDS - state.time;
  const isChoiceEntry = inChoice && elapsed - state.phaseEntryAt < 5;
  if (els.branchStatus) {
    if (inChoice && !hasChoice) {
      if (currentPhase.id === 'D') {
        els.branchStatus.textContent = '마지막 선택';
      } else {
        els.branchStatus.textContent = isChoiceEntry
          ? (state.observedThisLoop ? '이미 본 병목' : '지금 선택')
          : '지금 선택';
      }
      els.branchStatus.classList.add('is-live');
      els.branchStatus.classList.toggle('is-echoed', currentPhase.id === 'B' && state.observedThisLoop && isChoiceEntry);
    } else if (hasChoice) {
      const branch = BRANCHES.find((b) => b.id === state.currentBranchId);
      els.branchStatus.textContent = `${branch?.label ?? '선택 완료'} 선택됨`;
      els.branchStatus.classList.remove('is-live');
      els.branchStatus.classList.remove('is-echoed');
    } else {
      const branch = BRANCHES.find((b) => b.id === state.currentBranchId);
      els.branchStatus.textContent = branch
        ? `${branch.label} 여파 확인`
        : (currentPhase.id === 'A' ? '개입 대기' : '개입 종료');
      els.branchStatus.classList.remove('is-live');
      els.branchStatus.classList.remove('is-echoed');
    }
  }
  if (els.branchCard) {
    els.branchCard.classList.toggle('is-waiting', !inChoice && !state.branchLocked);
  }
  if (els.branchButtons) {
    els.branchButtons.hidden = false;
    els.branchButtons.querySelectorAll('button').forEach((button) => {
      const branchId = button.dataset.branchId;
      const count = state.branchCounts[branchId] ?? 0;
      const counter = button.querySelector('.branch-count');
      if (counter) counter.textContent = `x${count}`;
      const tier = button.querySelector('.branch-tier');
      if (tier) tier.textContent = masteryLabel(count);
      button.classList.toggle('is-chosen', state.choicePhaseId === currentPhase.id && branchId === state.currentBranchId);
      button.disabled = state.branchLocked || !inChoice;
      button.title = inChoice
        ? (currentPhase.id === 'D' ? '마지막 선택 구간에서 선택할 수 있다' : '지금 선택 가능')
        : '개입 구간에 도달하면 선택할 수 있다';
    });
  }
}

function hasEnoughCost(cost) {
  return Object.entries(cost).every(([resource, amount]) => (state.resources[resource] ?? 0) >= amount);
}

function payCost(cost) {
  Object.entries(cost).forEach(([resource, amount]) => {
    state.resources[resource] = clamp((state.resources[resource] ?? 0) - amount, 0, 999);
  });
}

function applyBranchDelta(branch, fail = false) {
  const payload = fail ? branch.fail : branch.effects;
  if (!payload) return;
  state.rift = clamp(state.rift + (payload.rift ?? 0), 0, BALANCE.riftThreshold);
  if (payload.resources) {
    Object.entries(payload.resources).forEach(([resource, amount]) => {
      state.resources[resource] = clamp((state.resources[resource] ?? 0) + amount, 0, 100);
    });
  }
  if (payload.chars) {
    state.characters = state.characters.map((c) => (
      Object.prototype.hasOwnProperty.call(payload.chars, c.id)
        ? { ...c, trust: clamp(c.trust + payload.chars[c.id], 0, 100), alive: payload.downChar === c.id ? false : c.alive }
        : c
    ));
  }
  if (payload.downChar) {
    state.characters = state.characters.map((c) => (c.id === payload.downChar ? { ...c, alive: false } : c));
  }
}

function familiarityBonus(branchId) {
  return clamp(state.branchCounts[branchId] ?? 0, 0, BALANCE.familiarityCap);
}

function masteryLabel(count) {
  if (count >= 3) return '정착';
  if (count === 2) return '숙련';
  if (count === 1) return '익숙';
  return '기본';
}

// 같은 분기를 누적해서 고른 횟수를 0/1/2 세 단계로 접어, 로그·여파 변주의 인덱스로 쓴다.
// (branchCounts 는 chooseBranch 에서 먼저 증가하므로 1회차→0, 2회차→1, 3회차+→2)
function aftermathTier(branchId) {
  return clamp((state.branchCounts[branchId] ?? 1) - 1, 0, 2);
}

function lastBranchMemoryEntry() {
  return state.branchMemory[state.branchMemory.length - 1] ?? '';
}

function branchIdFromMemoryEntry(entry) {
  return BRANCHES.find((b) => entry.startsWith(b.memoryTag))?.id ?? null;
}

function previousBranchId() {
  const prevEntry = state.branchMemory[state.branchMemory.length - 2] ?? '';
  return branchIdFromMemoryEntry(prevEntry);
}

function applyCrossBranchSynergy(branch) {
  const lastMemory = lastBranchMemoryEntry();
  const prevId = previousBranchId();

  if (branch.id === 'route_anchor' && lastMemory.includes('윤도현 지원')) {
    state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    pushLog('윤도현 지원의 잔향이 남아 있어 경로 고정이 더 단단해졌다. 확보 물자와 신뢰가 함께 붙었다.');
  } else if (branch.id === 'memory_knot' && lastMemory.includes('이세아 보호')) {
    state.resources.memory += 1;
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    pushLog('이세아 보호의 잔향이 남아 있어 기억 매듭이 한 겹 더 깊어졌다. 기억 조각과 신뢰가 함께 단단해졌다.');
  } else if (branch.id === 'signal_lantern' && lastMemory.includes('윤도현 경로 고정')) {
    state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
    state.resources.memory += 1;
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    pushLog('경로 고정의 잔향 위에 서가람 신호가 얹혔다. 구조가 보이자 예지도 더 선명해졌다.');
  } else if (branch.id === 'triage_chain' && lastMemory.includes('이세아 기억 매듭')) {
    state.resources.memory += 1;
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    pushLog('기억 매듭의 뒤를 이어 동시 구조가 더 촘촘해졌다. 이름과 동선이 함께 남았다.');
  } else if (branch.id === 'vision_relay' && lastMemory.includes('이세아 기억 매듭')) {
    state.resources.memory += 1;
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    pushLog('기억 매듭 위에 예지 전달이 얹혀 기억이 한 겹 더 깊어졌다. 진원의 윤곽이 선명해진다.');
  } else if (branch.id === 'relay_command' && lastMemory.includes('서가람 예지 집중')) {
    state.rift = clamp(state.rift - 2, 0, BALANCE.riftThreshold);
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    pushLog('예지 집중의 여세를 타고 지휘가 더 정확해졌다. 균열이 추가로 내려가고 신뢰가 굳는다.');
  }

  if (prevId === 'route_anchor' && branch.id === 'support_yun') {
    state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    pushLog('경로 고정의 뒤를 이어 윤도현이 다시 길을 갈랐다. 고정된 동선이 구조로 굳어 더 많은 사람이 빠져나갔다.');
  } else if (prevId === 'support_yun' && branch.id === 'route_anchor') {
    state.rift = clamp(state.rift - 2, 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    state.resources.trust = clamp(state.resources.trust + 2, 0, 100);
    pushLog('윤도현 지원이 남긴 길 위에 예지가 겹쳤다. 막힌 병목이 구조로 고정되며 다음 여파 국면의 바닥이 넓어졌다.');
  } else if (prevId === 'protect_seah' && branch.id === 'memory_knot') {
    state.resources.memory += 1;
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    state.resources.focus = clamp(state.resources.focus + 1, 0, 7);
    pushLog('이세아 보호의 뒤를 이어 기억 매듭이 더 촘촘해졌다. 이름과 방향이 함께 묶여 다음 루프의 길을 남겼다.');
  } else if (prevId === 'memory_knot' && branch.id === 'protect_seah') {
    state.resources.memory += 1;
    state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
    state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
    pushLog('기억 매듭이 먼저 남아 있어 이세아 보호가 더 멀리 닿았다. 같은 이름을 한 번 더 붙잡아 흔들림을 줄였다.');
  } else if (branch.id === 'conserve_foresight') {
    if (prevId === 'route_anchor') {
      state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
      state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
      pushLog('고정된 경로 덕분에 예지를 아낀 비용이 조금 덜 아팠다. 미룬 선택이 구조화된 대가로 바뀌었다.');
    } else if (prevId === 'memory_knot') {
      state.resources.memory += 1;
      state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
      pushLog('기억의 매듭 위에서 예지를 아끼자, 빚이 단서처럼 남았다. 다음 루프에서 더 빠르게 읽을 수 있다.');
    }
  }
}

// 선택 순간의 런 컨텍스트를 한 키로 접는다 — chooseLines[tier] 위에 덧댈 나비효과 후절 선택용.
// 같은 분기·같은 숙련 단계라도 그때의 균열/예지/회차 상태에 따라 결과 한 줄이 갈린다.
function choiceRiderKey() {
  if (state.rift >= BALANCE.crisisRift) return 'crisis';
  if (state.observedThisLoop) return 'observed';
  if (state.runs >= 1) return 'repeat';
  return 'calm';
}

// C구간 여파 직후의 상태를 한 키로 접는다 — aftermathLines[tier] 위에 덧댈 후절 선택용.
// 델타가 이미 반영된 시점이라, 실제로 누가 빠졌는지·균열·신뢰와 항상 일치한다.
function aftermathRiderKey() {
  if (state.characters.some((c) => !c.alive)) return 'fracture';
  if (state.rift >= BALANCE.crisisRift) return 'crisis';
  if (averageTrust() >= BALANCE.escapeTrustThreshold) return 'steady';
  return 'thin';
}

function chooseBranch(branchId) {
  const branch = BRANCHES.find((b) => b.id === branchId);
  const phaseId = phaseAt(LOOP_SECONDS - state.time).id;
  if (!branch || state.branchLocked || !CHOICE_PHASE_IDS.has(phaseId)) return;

  const bonus = familiarityBonus(branch.id);
  const adjustedCost = Object.fromEntries(
    Object.entries(branch.cost).map(([resource, amount]) => [resource, Math.max(0, amount - bonus)])
  );
  const fail = !hasEnoughCost(adjustedCost);
  if (!fail) payCost(adjustedCost);

  applyBranchDelta(branch, fail);
  if (!fail && bonus > 0) {
    state.rift = clamp(state.rift - bonus, 0, BALANCE.riftThreshold);
    state.resources.trust = clamp(state.resources.trust + bonus, 0, 100);
    pushLog(`숙련 보너스: ${branch.label}를 익숙하게 다뤄 추가 비용이 줄고 신뢰가 ${bonus}만큼 늘었다.`);
  }
  state.branchLocked = true;
  state.choicePhaseId = phaseId;
  state.currentBranchId = branch.id;
  state.branchCounts[branch.id] = (state.branchCounts[branch.id] ?? 0) + 1;
  state.running = false;
  state.lastTick = performance.now();
  refreshPrimaryActionLabel();
  const depthCount = state.branchCounts[branch.id];
  const depthMark = depthCount >= 3 ? ' ⟳깊음' : depthCount === 2 ? ' ⟳' : '';
  state.branchMemory.push(`${branch.memoryTag}${depthMark}`);
  state.branchMemory = state.branchMemory.slice(-6);

  showChoiceToast(`${branch.label} · ${fail ? '선택 실패' : '선택 완료'}`, fail ? 'danger' : 'good');

  const tier = aftermathTier(branch.id);
  if (fail) {
    pushLog(branch.fail.log);
  } else {
    const baseLine = branch.chooseLines?.[tier] ?? `${branch.label}: ${branch.desc}`;
    const rider = BRANCH_CHOICE_RIDERS[choiceRiderKey()] ?? '';
    pushLog(baseLine + rider);
    applyCrossBranchSynergy(branch);
  }
  updateResources();
}

function buildTimeline() {
  els.timelineTrack.innerHTML = '';
  PHASES.forEach((phase, idx) => {
    const seg = document.createElement('div');
    seg.className = 'timeline-seg';
    seg.style.width = `${100 / PHASES.length}%`;
    seg.textContent = '';
    seg.title = `${formatTime(LOOP_SECONDS - phase.start)} ~ ${formatTime(LOOP_SECONDS - phase.end)}`;
    seg.style.background = idx % 2 === 0 ? 'rgba(47, 212, 200, 0.05)' : 'rgba(255, 93, 93, 0.04)';
    els.timelineTrack.appendChild(seg);
  });
  els.timelineTrack.appendChild(els.timelineCursor);
}

function buildCharacterPanel() {
  els.charPanel.innerHTML = '';
  state.characters.forEach((c) => {
    const expanded = state.expandedChars.has(c.id);
    const card = document.createElement('article');
    card.className = `char-card ${expanded ? 'is-expanded' : 'is-collapsed'}`;
    if (!c.alive) card.classList.add('down');
    card.dataset.id = c.id;
    card.innerHTML = `
      <button class="char-card-toggle" type="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="char-details-${c.id}">
        <div class="char-card-top">
          <div>
            <div class="name">${c.name}</div>
            <div class="role">${c.role}</div>
          </div>
          <span class="char-chevron" aria-hidden="true">⌄</span>
        </div>
        <div class="char-meta">
          <span class="char-state">${c.alive ? '생존' : '이탈'}</span>
          <span class="char-hint">${expanded ? '접어두기' : '눌러 펼치기'}</span>
        </div>
      </button>
      <div id="char-details-${c.id}" class="char-details" ${expanded ? '' : 'hidden'}>
        <div class="char-bond">${c.bond ?? ''}</div>
        <div class="char-drive">${c.drive ?? ''}</div>
      </div>
      <div class="trust-row">
        <div class="trust-bar"><i></i></div>
        <span class="alive">${c.alive ? '생존' : '이탈'}</span>
      </div>
    `;
    card.querySelector('.char-card-toggle')?.addEventListener('click', () => {
      if (state.expandedChars.has(c.id)) state.expandedChars.delete(c.id);
      else state.expandedChars.add(c.id);
      buildCharacterPanel();
    });
    els.charPanel.appendChild(card);
  });
}

function buildResourceHud() {
  els.resourceHud.innerHTML = '';
  RESOURCES.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'res';
    el.dataset.id = r.id;
    if (r.reset === 'loop') el.dataset.reset = 'loop';
    el.innerHTML = `
      <div class="res-val">${state.resources[r.id]}</div>
      <div class="res-name">${r.name}</div>
    `;
    els.resourceHud.appendChild(el);
  });
}

function renderLog() {
  els.observationLog.innerHTML = '';
  state.observationLog.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.textContent = entry.text;
    if (entry.tone) li.classList.add(`tone-${entry.tone}`);
    if (idx === 0) li.classList.add('is-latest');
    els.observationLog.appendChild(li);
  });
}

function updateVisionPanel() {
  els.visionCost.textContent = `예지 ${state.observedThisLoop ? 0 : 1}`;
  els.btnVision.disabled = state.observedThisLoop || state.resources.foresight <= 0;
  els.btnVision.textContent = state.observedThisLoop ? '관측 완료' : '미래 보기';
  els.visionCard?.classList.toggle('is-revealed', state.observedThisLoop);

  const currentPhase = phaseAt(LOOP_SECONDS - state.time);
  if (state.observedThisLoop) {
    els.visionPreview.textContent = '관측 완료: 같은 병목이 다시 열린다. 이제 흐름을 바꿀 차례다.';
  } else if (currentPhase.id === 'A') {
    els.visionPreview.textContent = '아직 관측 전. 예지를 쓰면 다음 17분의 윤곽이 드러난다.';
  } else if (currentPhase.id === 'B') {
    els.visionPreview.textContent = '개입 직전. 관측하면 병목과 첫 비명이 먼저 보인다.';
  } else {
    els.visionPreview.textContent = '여파 국면. 관측하면 안전 경로와 남은 사람 위치를 빠르게 읽는다.';
  }
}

function updateCarryoverSummary(extra = '') {
  const base = '계승: 기억·신뢰 / 초기화: 예지·집중·물자';
  els.carryoverSummary.textContent = extra ? `${base} · ${extra}` : base;
}

function syncPhaseEntry(currentPhase) {
  if (state.lastPhaseId === currentPhase.id) return;
  state.lastPhaseId = currentPhase.id;

  if (currentPhase.id === 'B' || currentPhase.id === 'D') {
    state.phaseEntryAt = LOOP_SECONDS - state.time;
    state.phaseEntryCue = currentPhase.id === 'D'
      ? (state.observedThisLoop
        ? '후반 압박이 이미 읽혔다. 마지막 선택으로 여파를 꺾어야 한다.'
        : '장면이 후반으로 접어든다. 마지막 선택으로 루프의 끝을 바꿀 수 있다.')
      : (state.observedThisLoop
        ? '이미 본 병목이 같은 자리로 되돌아온다. 이번엔 그 흐름을 꺾어야 한다.'
        : '초반의 정전이 지나고 병목이 열린다. 군중이 쏟아지기 직전의 순간으로 들어간다.');
    return;
  }

  state.phaseEntryAt = 0;
  state.phaseEntryCue = '';
}

function updateStoryBeat() {
  const el = els.storyBeat;
  if (!el) return;
  const phase = phaseAt(LOOP_SECONDS - state.time);
  const beats = STORY_BEATS[phase.id];
  if (!beats) return;

  const elapsed = LOOP_SECONDS - state.time;
  if (CHOICE_PHASE_IDS.has(phase.id) && state.phaseEntryCue && elapsed - state.phaseEntryAt < 5) {
    el.textContent = state.phaseEntryCue;
    return;
  }

  if (phase.id === 'A' && state.running && elapsed < 30 && beats.opening) {
    el.textContent = beats.opening;
    return;
  }

  const loopTier = Math.min(Math.max(state.loop - 1, 0), 2);

  if (phase.id === 'A' || phase.id === 'C') {
    el.textContent = Array.isArray(beats.loops)
      ? (beats.loops[loopTier] ?? beats.default)
      : (beats.default ?? '');
    return;
  }

  const branchId = phase.id === 'D' && state.choicePhaseId !== 'D' ? null : state.currentBranchId;
  if (branchId) {
    const branchTexts = beats.branches?.[branchId];
    const branchRepeatPrefix = BRANCH_REPEAT_PREFIXES[Math.min(loopTier, BRANCH_REPEAT_PREFIXES.length - 1)] ?? '';
    if (Array.isArray(branchTexts)) {
      el.textContent = branchRepeatPrefix + (branchTexts[aftermathTier(branchId)] ?? beats.default);
    } else {
      el.textContent = branchRepeatPrefix + (branchTexts ?? beats.default);
    }
    return;
  }

  const repeatIdx = Math.min(loopTier, BEAT_REPEAT_PREFIXES.length - 1);
  el.textContent = BEAT_REPEAT_PREFIXES[repeatIdx] + (beats.default ?? '');
}

function updateClock() {
  const currentPhase = phaseAt(LOOP_SECONDS - state.time);
  syncPhaseEntry(currentPhase);
  els.loopClock.textContent = formatTime(state.time);
  const elapsed = LOOP_SECONDS - state.time;
  const isChoiceEntry = CHOICE_PHASE_IDS.has(currentPhase.id) && elapsed - state.phaseEntryAt < 5;
  if (els.phaseName) {
    if (isChoiceEntry) {
      els.phaseName.textContent = currentPhase.id === 'D'
        ? '마지막 압박 — 지금이 마지막 개입의 순간'
        : (state.observedThisLoop
          ? '병목 구간 — 이미 본 흐름이 돌아온다'
          : '병목 구간 — 지금이 개입의 순간');
    } else {
      els.phaseName.textContent = '';
    }
  }
  const pct = Math.min(1, Math.max(0, elapsed / LOOP_SECONDS));
  els.timelineCursor.style.left = `calc(${pct * 100}% - 1px)`;
  updateStoryBeat();
  refreshPrimaryActionLabel();
}

function updateResources() {
  RESOURCES.forEach((r) => {
    const valEl = els.resourceHud.querySelector(`.res[data-id="${r.id}"] .res-val`);
    if (!valEl) return;
    const next = state.resources[r.id];
    if (lastResVals[r.id] !== undefined && lastResVals[r.id] !== next) {
      // 값이 변할 때만 짧은 bump 애니메이션 재생(재시작 위해 reflow 강제)
      valEl.classList.remove('bump');
      void valEl.offsetWidth;
      valEl.classList.add('bump');
    }
    valEl.textContent = next;
    lastResVals[r.id] = next;
  });
  els.riftFill.style.width = `${state.rift}%`;
  els.riftValue.textContent = `${Math.min(100, state.rift)}/100`;
  els.rift?.classList.toggle('is-crisis', state.rift >= BALANCE.crisisRift);
  els.loopCount.textContent = state.runs > 0
    ? `루프 ${state.loop}회차 · ★${state.runs}`
    : `루프 ${state.loop}회차`;

  buildCharacterPanel();

  updateVisionPanel();
  updateBranchPanel();
  renderBranchMemory();
  renderBranchLinkCue();
  const runCue = state.runBonus > 0 ? ` · 회차 보상 예지 +${state.runBonus}` : '';
  updateCarryoverSummary(`현재 평균 신뢰 ${averageTrust()}%${runCue} · 여파 국면의 여파가 다음 고리로 이어진다`);
  checkEndState();
}

// ── 회차 진행도(반복 플레이 보상) ───────────────────────────
const RUNS_KEY = 'm17_runs';
function readRuns() {
  try { return Number(localStorage.getItem(RUNS_KEY)) || 0; } catch (e) { return 0; }
}
function recordRun() {
  try { localStorage.setItem(RUNS_KEY, String(readRuns() + 1)); } catch (e) { /* 저장 불가 환경 무시 */ }
}

// 두 번째 플레이부터 '회차 보상': 지난 고리 수만큼(상한) 예지를 더 안고 시작한다.
function applyRunReward() {
  state.runs = readRuns();
  if (state.runs <= 0) return;
  const bonus = clamp(state.runs, 0, BALANCE.runBonusCap);
  state.runBonus = bonus;
  state.resources.foresight = clamp(state.resources.foresight + bonus, 0, 99);
  pushLog(`${state.runs + 1}회차 도전: 지난 고리의 잔향이 남아 예지 +${bonus}로 시작한다.`, 'good');
}

// ── 엔딩 / 종료 상태 ────────────────────────────────────────
// 엔딩 id → 결말 종류 한 단어(붕괴/진실/함께/경로/기억/신호/뿌리/홀로/회차). 요약 칩과 색 강조에 쓴다.
const ENDING_KIND = {
  collapse: '붕괴',
  escape_true: '진실',
  escape_together: '함께',
  escape_route: '경로',
  escape_memory: '기억',
  escape_beacon: '신호',
  escape_root: '뿌리',
  escape_alone: '홀로',
  escape_archive: '회차',
};

// ── 엔딩 도감(코덱스) ───────────────────────────────────────
// 새 진행 시스템을 만들지 않고, 도달한 엔딩 id만 단일 localStorage 키에 누적한다
// (기존 m17_runs / m17_tutorial_done 와 동일한 경량 패턴). state·ENDINGS 를 그대로 재사용한다.
const ENDINGS_KEY = 'm17_endings';

// 잠금 항목에도 보여줄 '해금 조건' 한 줄 — 실제 판정(attemptEscape/checkEndState)과
// 같은 BALANCE 상수에서 만들어 항상 일치시킨다.
const ENDING_CONDITION = {
  collapse: `균열 게이지 <b>${BALANCE.riftThreshold}</b> 도달`,
  escape_together: `진원 해금(기억 ${BALANCE.memoryEscapeThreshold}+) 후 평균 신뢰 <b>${BALANCE.escapeTrustThreshold}+</b> 로 진입`,
  escape_route: `서가람/윤도현 계열 분기 <b>각 1회 이상</b> · 기억 <b>6+</b> · 평균 신뢰 <b>22+</b> 로 진입`,
  escape_memory: `이세아 계열 분기 <b>각 1회 이상</b> · 기억 <b>6+</b> · 평균 신뢰 <b>22+</b> 로 진입`,
  escape_beacon: `서가람 신호 고정 <b>2회+</b> · 윤도현 경로 고정 <b>1회+</b> · 예지 <b>3+</b> · 평균 신뢰 <b>22+</b> 로 진입`,
  escape_root: `기억 매듭·동시 구조 <b>각 1회+</b> · 이세아 계열 합산 <b>3+</b> · 기억 <b>7+</b> · 평균 신뢰 <b>22+</b> 로 진입`,
  escape_alone: `진원 해금 후 평균 신뢰 <b>${BALANCE.escapeTrustThreshold} 미만</b>으로 진입`,
  escape_true: `기억 <b>${BALANCE.trueEscapeMemory}+</b> · 평균 신뢰 <b>${BALANCE.trueEscapeTrust}+</b> 로 진입`,
  escape_archive: `2회차+ · 기억 <b>${BALANCE.archiveMemory}+</b> · 평균 신뢰 <b>${BALANCE.archiveTrust}+</b> 로 진입`,
};

function readUnlockedEndings() {
  try {
    return new Set((localStorage.getItem(ENDINGS_KEY) || '').split(',').filter(Boolean));
  } catch (e) { return new Set(); }
}

// 이번 세션 동안의 해금 상태(영속 저장 실패 환경에서도 도감이 동작하도록 메모리에도 보관).
const unlockedEndings = readUnlockedEndings();
let justUnlockedEnding = null; // 직전 고리에서 방금 해금한 엔딩 → 도감에서 'NEW' 강조

function unlockEnding(id) {
  if (!ENDINGS[id]) return;
  justUnlockedEnding = id;
  if (unlockedEndings.has(id)) { updateCodexButton(); return; }
  unlockedEndings.add(id);
  try { localStorage.setItem(ENDINGS_KEY, [...unlockedEndings].join(',')); } catch (e) { /* 저장 불가 환경 무시 */ }
  updateCodexButton();
}

function updateCodexButton() {
  const total = Object.keys(ENDINGS).length;
  const count = unlockedEndings.size;
  if (els.codexCount) els.codexCount.textContent = `${count}/${total}`;
  els.btnCodex?.classList.toggle('is-complete', count >= total);
}

function renderCodex() {
  if (!els.codexList) return;
  const ids = Object.keys(ENDINGS);
  const count = unlockedEndings.size;
  if (els.codexProgress) els.codexProgress.textContent = `${count} / ${ids.length}`;
  if (els.codexSub) {
    const latest = justUnlockedEnding ? ENDINGS[justUnlockedEnding]?.title : null;
    els.codexSub.textContent = count === 0
      ? '첫 결말을 열면 도감이 살아난다'
      : count >= ids.length
        ? '모든 결말이 해금됐다 — 이제 조합을 바꿔 다른 고리를 노려볼 수 있다'
        : latest
          ? `방금 새겨진 결말: ${latest} · 남은 결말 ${ids.length - count}개`
          : `해금된 결말 ${count}개 · 남은 결말 ${ids.length - count}개`;
  }
  els.codexList.innerHTML = ids.map((id) => {
    const ending = ENDINGS[id];
    const unlocked = unlockedEndings.has(id);
    const kind = ENDING_KIND[id] ?? '종료';
    const isNew = unlocked && id === justUnlockedEnding;
    if (unlocked) {
      return `<li class="codex-entry is-unlocked tone-${ending.tone}">
        <div class="codex-entry-top">
          <span class="codex-entry-tag">${ending.tag}</span>
          ${isNew ? '<span class="codex-entry-new">방금 해금</span>' : `<span class="codex-entry-kind">${kind}</span>`}
        </div>
        <div class="codex-entry-title">${ending.title}</div>
        <div class="codex-entry-line">${ending.line}</div>
        <div class="codex-entry-cond">해금 조건 · ${ENDING_CONDITION[id] ?? '특정 조건에서 도달'}</div>
      </li>`;
    }
    return `<li class="codex-entry is-locked tone-${ending.tone}">
      <div class="codex-entry-top">
        <span class="codex-entry-tag">??? · 미해금</span>
        <span class="codex-entry-kind">?</span>
      </div>
      <div class="codex-entry-title">？ ？ ？</div>
      <div class="codex-entry-cond">해금 조건 · ${ENDING_CONDITION[id] ?? '특정 조건에서 도달'}</div>
    </li>`;
  }).join('');
}

function openCodex() {
  renderCodex();
  if (els.codexOverlay) els.codexOverlay.hidden = false;
}

function closeCodex() {
  if (els.codexOverlay) els.codexOverlay.hidden = true;
}

// 엔딩 오버레이의 요약 스트립: 이번 고리의 실제 상태(기존 state 재사용)를 칩으로 보여준다.
function renderEndingSummary(ending) {
  if (!els.endingSummary) return;
  const lastBranch = BRANCHES.find((b) => b.id === state.currentBranchId);
  const prevBranch = branchIdFromMemoryEntry(state.branchMemory[state.branchMemory.length - 2] ?? '');
  const prevBranchLabel = prevBranch ? (BRANCHES.find((b) => b.id === prevBranch)?.label ?? prevBranch) : '';
  const lastBranchLabel = lastBranch?.label ?? (state.branchMemory.slice(-1)[0] ?? '없음');
  const connectionLabel = prevBranchLabel ? `${prevBranchLabel} → ${lastBranchLabel}` : lastBranchLabel;
  // recordRun() 이 직전에 호출되어 localStorage 는 +1 됐지만 state.runs 는 이번 시작 시점 값이므로,
  // '이번 고리 포함 완료 횟수'는 state.runs + 1 로 읽는다.
  const items = [
    ['결말 타입',   ENDING_KIND[ending.id] ?? '종료', true,  false],
    ['도달 루프',    `${state.loop}회`,                false, false],
    ['완료 누적',    `${state.runs + 1}회`,           false, false],
    ['팀 평균 신뢰', `${averageTrust()}%`,             false, false],
    ['기억 축적',    `${state.resources.memory}개`,    false, false],
    ['마지막 연결',  connectionLabel,                 false, true],
  ];
  els.endingSummary.innerHTML = items
    .map(([k, v, hot, wide]) =>
      `<div class="ending-stat${hot ? ' is-result' : ''}${wide ? ' is-wide' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');
}

function endGame(endingId) {
  const ending = ENDINGS[endingId];
  if (!ending || state.ended) return;
  state.ended = true;
  recordRun();
  unlockEnding(ending.id);
  state.running = false;
  refreshPrimaryActionLabel();
  els.endingCard.className = `overlay-card ending-card tone-${ending.tone}`;
  els.endingOverlay.className = `overlay tone-${ending.tone}`;
  els.endingTag.textContent = ending.tag;
  if (els.endingAtmos) els.endingAtmos.textContent = ending.atmos ?? '';
  els.endingTitle.textContent = ending.title;
  els.endingLine.textContent = ending.line;
  renderEndingSummary(ending);
  els.endingHint.textContent = ending.hint;
  els.endingOverlay.hidden = false;
}

// 매 자원 갱신마다 호출: 균열 붕괴(패배)와 진원 해금(탈출 트리거)을 판정한다.
function checkEndState() {
  if (state.ended) return;
  if (state.rift >= BALANCE.riftThreshold) {
    endGame('collapse');
    return;
  }
  if (state.resources.memory >= BALANCE.memoryEscapeThreshold && els.escapeCard?.hidden) {
    els.escapeCard.hidden = false;
    pushLog('진원 해금: 기억 조각이 임계에 닿아 고리를 끊을 길이 열렸다.', 'good');
  }
}

function attemptEscape() {
  if (state.ended || els.escapeCard?.hidden) return;
  const avg = averageTrust();
  const mem = state.resources.memory;
  const foresight = state.resources.foresight;
  const routeAffinity = (state.branchCounts.support_yun ?? 0)
    + (state.branchCounts.route_anchor ?? 0)
    + (state.branchCounts.signal_lantern ?? 0)
    + (state.branchCounts.foresight_burn ?? 0)
    + (state.branchCounts.vanguard_push ?? 0)
    + (state.branchCounts.relay_command ?? 0);
  const memoryAffinity = (state.branchCounts.protect_seah ?? 0)
    + (state.branchCounts.memory_knot ?? 0)
    + (state.branchCounts.triage_chain ?? 0)
    + (state.branchCounts.memory_shield ?? 0)
    + (state.branchCounts.vision_relay ?? 0);
  // 위에서부터 높은 티어 순으로 판정한다. 진실 엔딩(최상위)을 회차 엔딩보다 먼저 확인해야
  // 기억·신뢰를 모두 끌어올린 반복 플레이어가 더 낮은 '회차' 엔딩에 묻히지 않는다.
  if (mem >= BALANCE.trueEscapeMemory && avg >= BALANCE.trueEscapeTrust) {
    endGame('escape_true');
  } else if (state.branchCounts.signal_lantern >= 2 && state.branchCounts.route_anchor >= 1 && routeAffinity >= 3 && foresight >= 3 && avg >= 22) {
    endGame('escape_beacon');
  } else if (state.branchCounts.triage_chain >= 1 && state.branchCounts.memory_knot >= 1 && memoryAffinity >= 3 && mem >= 7 && avg >= 22) {
    endGame('escape_root');
  } else if (state.branchCounts.support_yun > 0 && state.branchCounts.route_anchor > 0 && routeAffinity >= 3 && mem >= 6 && avg >= 22) {
    endGame('escape_route');
  } else if (state.branchCounts.protect_seah > 0 && state.branchCounts.memory_knot > 0 && memoryAffinity >= 3 && mem >= 6 && avg >= 22) {
    endGame('escape_memory');
  } else if (state.runs >= 1 && mem >= BALANCE.archiveMemory && avg >= BALANCE.archiveTrust) {
    endGame('escape_archive');
  } else {
    endGame(avg >= BALANCE.escapeTrustThreshold ? 'escape_together' : 'escape_alone');
  }
}

// ── 첫 플레이 온보딩 ────────────────────────────────────────
const TUTORIAL_KEY = 'm17_tutorial_done';
let tutorialIndex = 0;

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  if (!step) return;
  els.tutorialIcon.textContent = step.icon;
  els.tutorialStep.textContent = `${tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`;
  els.tutorialTitle.textContent = step.title;
  els.tutorialBody.innerHTML = step.body; // 정적 신뢰 데이터(<b> 강조 포함)
  els.btnTutorialNext.textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? '루프 시작' : '다음';
  if (els.btnTutorialSkip) {
    els.btnTutorialSkip.textContent = tutorialIndex === 0 ? '바로 시작' : '건너뛰기';
  }
}

function advanceTutorial() {
  if (tutorialIndex < TUTORIAL_STEPS.length - 1) {
    tutorialIndex += 1;
    renderTutorialStep();
  } else {
    els.tutorialOverlay.hidden = true;
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) { /* 저장 불가 환경 무시 */ }
    state.running = false;
    state.lastTick = performance.now();
    refreshPrimaryActionLabel();
  }
}

function skipTutorial() {
  els.tutorialOverlay.hidden = true;
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) { /* 저장 불가 환경 무시 */ }
  state.running = false;
  state.lastTick = performance.now();
  refreshPrimaryActionLabel();
}

function maybeOpenTutorial() {
  let seen = false;
  try { seen = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) { seen = false; }
  if (seen) {
    state.running = false;
    state.lastTick = performance.now();
    refreshPrimaryActionLabel();
    return;
  }
  tutorialIndex = 0;
  renderTutorialStep();
  els.tutorialOverlay.hidden = false;
}

function applyDisasterImpact() {
  const observed = state.observedThisLoop;
  const trustDelta = observed ? -4 : -11;
  const supplyDelta = observed ? -1 : 0;
  const focusDelta = observed ? 0 : -1;
  const riftDelta = observed ? 4 : 10;

  state.resources.trust = clamp(state.resources.trust + trustDelta, 0, 100);
  state.resources.supply = clamp(state.resources.supply + supplyDelta, 0, 4);
  state.resources.focus = clamp(state.resources.focus + focusDelta, 0, 7);
  state.rift = clamp(state.rift + riftDelta, 0, BALANCE.riftThreshold);

  state.characters = state.characters.map((c) => {
    if (c.id === 'yundohyeon') return { ...c, trust: clamp(c.trust + (observed ? 4 : -10), 0, 100) };
    if (c.id === 'iseah') return { ...c, trust: clamp(c.trust + (observed ? 2 : -6), 0, 100) };
    if (c.id === 'seogaram') return { ...c, trust: clamp(c.trust + (observed ? 1 : -4), 0, 100) };
    return c;
  });

  pushLog(
    observed
      ? '병목 구간 예지: 군중 병목을 읽어 피해를 줄였다. 예지 1을 쓰고, 신뢰 손실을 최소화했다.'
      : '병목 구간 압사: 예지 없이 돌입해 신뢰와 집중력이 흔들렸다. 다음 루프에서 관측이 필요하다.'
  );
}

function applyBranchAftermath(currentPhase) {
  if (!CHOICE_PHASE_IDS.has(currentPhase.id)) return;
  const branchId = state.currentBranchId;
  // 분기를 아예 고르지 않은 루프도 C구간에 고유한 결을 남긴다(개입 부재의 대가).
  if (!branchId) {
    state.rift = clamp(state.rift + 3, 0, BALANCE.riftThreshold);
    pushLog('분기 없는 루프: 손을 뻗지 못한 대가가 여파 국면 폭발과 함께 한 번에 되돌아왔다.'
      + (BRANCH_AFTERMATH_RIDERS[aftermathRiderKey()] ?? ''));
    return;
  }
  const branch = BRANCHES.find((b) => b.id === branchId);
  const tier = aftermathTier(branchId); // 0/1/2 — 같은 분기 누적 숙련 단계
  // 숙련이 오를수록: 윤도현은 균열 완화가 깊어지고(정착 시 신뢰까지 굳음),
  // 이세아는 기억이 한 겹 더 쌓이며(정착 시 균열까지 안정), 예지 보존은 미룬 빚이 더 커진다.
  if (branchId === 'support_yun') {
    state.rift = clamp(state.rift - (3 + tier), 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    if (tier >= 2) state.resources.trust = clamp(state.resources.trust + 2, 0, 100);
  } else if (branchId === 'route_anchor') {
    state.rift = clamp(state.rift - (2 + tier), 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    if (tier >= 1) state.resources.trust = clamp(state.resources.trust + 1, 0, 100);
  } else if (branchId === 'signal_lantern') {
    state.resources.memory += 1 + (tier >= 2 ? 1 : 0);
    state.resources.trust = clamp(state.resources.trust + 1 + (tier >= 1 ? 1 : 0), 0, 100);
    if (tier >= 2) state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
  } else if (branchId === 'protect_seah') {
    state.resources.memory += 1 + (tier >= 2 ? 1 : 0);
    state.resources.focus = clamp(state.resources.focus + 1, 0, 7);
    if (tier >= 2) state.rift = clamp(state.rift - 2, 0, BALANCE.riftThreshold);
  } else if (branchId === 'memory_knot') {
    state.resources.memory += 1 + (tier >= 2 ? 1 : 0);
    state.resources.trust = clamp(state.resources.trust + 1 + (tier >= 2 ? 1 : 0), 0, 100);
    if (tier >= 1) state.rift = clamp(state.rift - 1, 0, BALANCE.riftThreshold);
  } else if (branchId === 'triage_chain') {
    state.resources.memory += 1 + (tier >= 1 ? 1 : 0);
    state.resources.trust = clamp(state.resources.trust + 2, 0, 100);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    if (tier >= 2) state.focus = clamp(state.focus + 1, 0, 7);
  } else if (branchId === 'conserve_foresight') {
    state.rift = clamp(state.rift + (5 + tier * 2), 0, BALANCE.riftThreshold);
    state.resources.trust = clamp(state.resources.trust - (2 + tier), 0, 100);
  } else if (branchId === 'foresight_burn') {
    state.resources.memory += 2 + (tier >= 2 ? 1 : 0);
    state.resources.trust = clamp(state.resources.trust + 1 + (tier >= 1 ? 1 : 0), 0, 100);
    if (tier >= 2) state.rift = clamp(state.rift - 2, 0, BALANCE.riftThreshold);
  } else if (branchId === 'vanguard_push') {
    state.rift = clamp(state.rift - (3 + tier), 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    if (tier >= 1) state.resources.trust = clamp(state.resources.trust + 2, 0, 100);
  } else if (branchId === 'memory_shield') {
    state.resources.trust = clamp(state.resources.trust + (3 + tier), 0, 100);
    if (tier >= 1) state.resources.memory += 1;
    if (tier >= 2) state.rift = clamp(state.rift - 2, 0, BALANCE.riftThreshold);
  } else if (branchId === 'vision_relay') {
    state.resources.memory += 2 + (tier >= 2 ? 1 : 0);
    state.resources.trust = clamp(state.resources.trust + 2 + (tier >= 1 ? 1 : 0), 0, 100);
    if (tier >= 2) state.rift = clamp(state.rift - 2, 0, BALANCE.riftThreshold);
  } else if (branchId === 'relay_command') {
    state.rift = clamp(state.rift - (3 + tier), 0, BALANCE.riftThreshold);
    state.resources.supply = clamp(state.resources.supply + 1, 0, 4);
    if (tier >= 1) state.resources.trust = clamp(state.resources.trust + 2, 0, 100);
    if (tier >= 2) state.resources.memory += 1;
  }
  const line = branch?.aftermathLines?.[tier];
  // 숙련 tier 의 여파 줄 + 델타 반영 후 상태의 후절 = 같은 분기 여파의 미세 분화.
  if (line) pushLog(line + (BRANCH_AFTERMATH_RIDERS[aftermathRiderKey()] ?? ''));
}

function triggerPhaseDisaster(currentPhase) {
  if (currentPhase.id !== 'B' || state.disasterTriggered) return;
  state.disasterTriggered = true;
  if (!state.branchLocked) {
    pushLog('병목 구간 미선택: 작은 선택이 늦어져 기본 피해가 발생했다.');
  }
  applyDisasterImpact();
  updateResources();
}

function observeFuture() {
  if (state.observedThisLoop || state.resources.foresight <= 0) return;

  state.resources.foresight -= 1;
  state.resources.memory += 1;
  state.observedThisLoop = true;
  pushLog('예지 관측: 병목 구간의 군중 병목과 윤도현의 동선 개방이 먼저 보였다. 이제 그 장면을 바꿀 한 번의 손길만 남았다.');
  updateResources();
}

function resetLoop() {
  const carriedTrust = Math.round(BALANCE.trustCarryRate * averageTrust());
  // currentBranchId 는 아래에서 초기화되므로, 계승 요약에 쓸 마지막 분기의 숙련 단계를 먼저 잡아둔다.
  const lastBranchId = state.currentBranchId;
  state.running = false;
  state.time = LOOP_SECONDS;
  state.rift = clamp(state.rift + BALANCE.riftPerLoop, 0, BALANCE.riftThreshold);
  state.resources = {
    ...makeResourceState(),
    memory: state.resources.memory,
    trust: carriedTrust,
  };
  state.characters = state.characters.map((c) => ({
    ...c,
    trust: Math.round(c.trust * BALANCE.trustCarryRate),
    alive: true,
  }));
  state.loop += 1;
  state.observedThisLoop = false;
  state.disasterTriggered = false;
  state.branchLocked = false;
  state.currentBranchId = null;
  state.branchAftermathTriggered = false;
  refreshPrimaryActionLabel();
  pushLog(`루프 ${state.loop - 1} 종료: 기억 조각은 남고, 신뢰는 일부만 계승된다.`);
  // 계승 요약에도 마지막 분기의 숙련 단계를 덧붙여, 같은 분기라도 회차마다 다르게 읽힌다.
  const lastTag = state.branchMemory.slice(-1)[0] ?? '없음';
  const masteryNote = lastBranchId
    ? ` (${masteryLabel(state.branchCounts[lastBranchId] ?? 0)})`
    : '';
  updateCarryoverSummary(`신뢰 계승 ${Math.round(BALANCE.trustCarryRate * 100)}% · 기억 조각은 영구 누적 · 최근 분기 ${lastTag}${masteryNote}`);
  updateClock();
  updateResources();
}

function advanceScene() {
  if (state.ended) return;
  const currentPhase = phaseAt(LOOP_SECONDS - state.time);
  const phaseIndex = PHASES.findIndex((p) => p.id === currentPhase.id);

  if (currentPhase.id === 'D') {
    if (state.branchLocked) applyBranchAftermath(currentPhase);
    resetLoop();
    return;
  }

  const nextPhase = PHASES[phaseIndex + 1];
  if (!nextPhase) {
    resetLoop();
    return;
  }

  if (state.branchLocked && CHOICE_PHASE_IDS.has(currentPhase.id)) {
    applyBranchAftermath(currentPhase);
  }
  state.branchLocked = false;
  state.time = LOOP_SECONDS - nextPhase.start;
  state.lastPhaseId = currentPhase.id;
  updateClock();
  updateBranchPanel();
  updateResources();
}

function tick(now) {
  state.lastTick = now;
  requestAnimationFrame(tick);
}

els.btnStart.addEventListener('click', advanceScene);

els.btnSecondary?.addEventListener('click', () => {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.toggle('secondary-open');
  refreshSecondaryActionLabel();
});

els.btnPause.addEventListener('click', () => {
  state.running = false;
  els.btnStart.textContent = '재개';
});

els.btnReset.addEventListener('click', () => {
  state.time = LOOP_SECONDS;
  state.running = false;
  state.lastTick = performance.now();
  state.observedThisLoop = false;
  state.disasterTriggered = false;
  state.branchLocked = false;
  state.currentBranchId = null;
  state.choicePhaseId = null;
  state.branchAftermathTriggered = false;
  document.getElementById('app')?.classList.remove('secondary-open');
  refreshPrimaryActionLabel();
  refreshSecondaryActionLabel();
  pushLog('플레이어가 루프를 되감았다. 현재 회차의 상태를 다시 정리한다.');
  updateClock();
  updateResources();
});

els.btnVision.addEventListener('click', observeFuture);

els.speedSelect.addEventListener('change', (e) => {
  state.speed = Number(e.target.value);
});

els.btnEscape?.addEventListener('click', attemptEscape);
els.btnTutorialNext?.addEventListener('click', advanceTutorial);
els.btnTutorialSkip?.addEventListener('click', skipTutorial);
els.btnEndingRestart?.addEventListener('click', () => location.reload());

els.btnCodex?.addEventListener('click', openCodex);
els.btnCodexClose?.addEventListener('click', closeCodex);
// 배경(오버레이 여백) 탭으로도 닫기 — 모바일 친화적 dismiss
els.codexOverlay?.addEventListener('click', (e) => { if (e.target === els.codexOverlay) closeCodex(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && els.codexOverlay && !els.codexOverlay.hidden) closeCodex(); });

buildTimeline();
buildCharacterPanel();
buildResourceHud();
buildBranchButtons();
updateCodexButton();
applyRunReward();
renderLog();
renderBranchMemory();
refreshSecondaryActionLabel();
updateClock();
updateResources();
maybeOpenTutorial();
requestAnimationFrame((now) => {
  state.lastTick = now;
  requestAnimationFrame(tick);
});
