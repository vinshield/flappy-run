const START_NG_ORIGIN = 'https://start.ng';
let startNgFramePromise = null;

function connectFrame() {
  if (startNgFramePromise) return startNgFramePromise;

  startNgFramePromise = new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.src = `${START_NG_ORIGIN}/connect`;
    frame.title = 'start.ng connection';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.display = 'none';
    frame.style.position = 'absolute';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';

    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error('Failed to connect to start.ng'));

    document.body.appendChild(frame);
  });

  return startNgFramePromise;
}

async function askStartNg(message, replyType, timeoutMs = 5000) {
  try {
    const frame = await connectFrame();
    return await new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const done = (reply) => {
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(reply);
      };

      const timer = window.setTimeout(() => done(null), timeoutMs);

      function onMessage(event) {
        if (event.origin !== START_NG_ORIGIN) return;
        if (event.source !== frame.contentWindow) return;
        if (event.data && event.data.type === replyType && event.data.requestId === requestId) {
          done(event.data);
        }
      }

      window.addEventListener('message', onMessage);
      frame.contentWindow.postMessage({ ...message, requestId }, START_NG_ORIGIN);
    });
  } catch (error) {
    return null;
  }
}

function buildStartNgSignInUrl() {
  const returnTarget = location.href || `${location.origin}${location.pathname}`;
  return `https://start.ng/?return_to=${encodeURIComponent(returnTarget)}`;
}

async function fetchCurrentPlayer() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return null;

  return {
    user: reply.user || null,
    guest: reply.guest || null,
    signedIn: !!reply.user,
    player: reply.user || reply.guest || null,
  };
}

async function submitScoreToStartNg(score) {
  if (!Number.isFinite(score) || score < 0) return { ok: false, error: 'Invalid score' };
  const reply = await askStartNg({ type: 'startng:score', score }, 'startng:scoreSaved');
  if (!reply) {
    return { ok: false, error: 'Connection unavailable' };
  }

  if (reply.ok === false) {
    return { ok: false, error: reply.error || 'Score not saved' };
  }

  return { ok: true, ...reply };
}

async function loadLeaderboard(limit = 10) {
  const reply = await askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData');
  if (!reply || !reply.ok) {
    return { ok: false, entries: [] };
  }

  return {
    ok: true,
    entries: Array.isArray(reply.entries) ? reply.entries : [],
  };
}

window.startNgClient = {
  START_NG_ORIGIN,
  askStartNg,
  buildStartNgSignInUrl,
  fetchCurrentPlayer,
  submitScoreToStartNg,
  loadLeaderboard,
};
