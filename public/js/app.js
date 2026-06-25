import { terminalOptions } from './terminal-options.js';
import { attachScrollbarHitArea, attachTerminalBehavior, configureTerminalInteractions } from './terminal-interactions.js';

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const terminalHost = document.getElementById('terminalHost');
const sessionTabs = document.getElementById('sessionTabs');
const addSessionButton = document.getElementById('addSession');
const broadcastToggle = document.getElementById('broadcastToggle');
const sessions = [];
// Sessions linked for broadcast: a keystroke in any linked terminal goes to all
// linked terminals. Shift-click a tab to toggle its membership.
const broadcastTargets = new Set();
// Titles of closed tabs, for Option+Shift+T "reopen" (newest first popped).
const closedTitles = [];
let activeSessionId = null;
let renamingSessionId = null;
let enteringSessionId = null;

// Shared highlight that slides between tabs instead of each tab toggling its own
// background, so switching sessions animates the active-tab background sideways.
const tabIndicator = document.createElement('div');
tabIndicator.className = 'tab-indicator';
let indicatorPlaced = false;

function updateIndicator() {
  const activeTab = sessionTabs.querySelector('.session-tab.active');
  if (!activeTab) {
    tabIndicator.style.opacity = '0';
    return;
  }
  const apply = () => {
    tabIndicator.style.opacity = '1';
    tabIndicator.style.left = `${activeTab.offsetLeft}px`;
    tabIndicator.style.top = `${activeTab.offsetTop}px`;
    tabIndicator.style.width = `${activeTab.offsetWidth}px`;
    tabIndicator.style.height = `${activeTab.offsetHeight}px`;
  };
  if (!indicatorPlaced) {
    // Don't slide in from the left edge on first paint — place it instantly.
    tabIndicator.classList.add('no-anim');
    apply();
    requestAnimationFrame(() => tabIndicator.classList.remove('no-anim'));
    indicatorPlaced = true;
  } else {
    apply();
  }
}

function sendInputToOne(session, data) {
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'input', data }));
    return;
  }
  session.pendingMessages.push({ type: 'input', data });
}

function sendInput(session, data) {
  // If the typing terminal is part of a broadcast group, mirror to every linked
  // terminal; otherwise just send to itself.
  if (broadcastTargets.has(session.id)) {
    for (const target of sessions) {
      if (broadcastTargets.has(target.id)) sendInputToOne(target, data);
    }
    return;
  }
  sendInputToOne(session, data);
}

configureTerminalInteractions({ sendInput });

function resizeSession(session) {
  if (!session.container.classList.contains('active')) return;
  session.fitAddon.fit();
  const message = { type: 'resize', cols: session.term.cols, rows: session.term.rows };
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify(message));
    return;
  }
  session.pendingMessages.push(message);
}

function flushPendingMessages(session) {
  while (session.pendingMessages.length > 0 && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify(session.pendingMessages.shift()));
  }
}

function startRenameSession(id) {
  renamingSessionId = id;
  renderTabs();
}

function commitRename(session, value) {
  const trimmed = value.trim();
  if (trimmed) session.title = trimmed;
  renamingSessionId = null;
  renderTabs();
}

function renderTabs() {
  sessionTabs.replaceChildren();
  for (const session of sessions) {
    const tab = document.createElement('div');
    tab.tabIndex = 0;
    tab.className = `session-tab${session.id === activeSessionId ? ' active' : ''}${session.id === enteringSessionId ? ' entering' : ''}${broadcastTargets.has(session.id) ? ' broadcast' : ''}`;
    tab.dataset.sessionId = session.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(session.id === activeSessionId));
    tab.title = session.title;
    tab.addEventListener('click', (event) => {
      if (event.metaKey && event.altKey) {
        toggleAllBroadcast();
        return;
      }
      if (event.metaKey) {
        toggleBroadcastSingle(session.id);
        return;
      }
      if (event.shiftKey) {
        selectBroadcastRange(session.id);
        return;
      }
      activateSession(session.id);
    });
    tab.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      startRenameSession(session.id);
    });
    tab.addEventListener('dblclick', (event) => {
      if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return;
      event.preventDefault();
      startRenameSession(session.id);
    });

    if (session.id === renamingSessionId) {
      const input = document.createElement('input');
      input.className = 'session-tab-rename';
      input.type = 'text';
      input.value = session.title;
      input.size = 1;
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitRename(session, input.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          renamingSessionId = null;
          renderTabs();
        }
      });
      input.addEventListener('blur', () => commitRename(session, input.value));
      tab.append(input);
      sessionTabs.append(tab);
      input.focus();
      input.select();
      continue;
    }

    const label = document.createElement('span');
    label.className = 'session-tab-label';
    label.textContent = session.title;
    tab.append(label);

    if (sessions.length > 1) {
      const close = document.createElement('span');
      close.className = 'session-close';
      close.textContent = '×';
      close.setAttribute('aria-label', `${session.title} 닫기`);
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        closeSession(session.id);
      });
      tab.append(close);
    }

    sessionTabs.append(tab);
  }
  enteringSessionId = null;
  sessionTabs.append(tabIndicator);
  updateIndicator();
}

function activateSession(id) {
  activeSessionId = id;
  for (const session of sessions) {
    const active = session.id === id;
    session.container.classList.toggle('active', active);
    if (active) {
      resizeSession(session);
      session.term.focus();
    }
  }
  renderTabs();
}

function teardownSession(id) {
  const index = sessions.findIndex((session) => session.id === id);
  if (index === -1) return;

  const [session] = sessions.splice(index, 1);
  closedTitles.push(session.title);
  // Drop the closed tab from the group; a group needs 2+, so once a lone tab
  // would remain, turn broadcast off entirely.
  broadcastTargets.delete(id);
  if (broadcastTargets.size < 2) {
    broadcastTargets.clear();
    broadcastToggle.classList.remove('active');
    broadcastToggle.setAttribute('aria-pressed', 'false');
  }
  session.ws.close();
  session.term.dispose();
  session.container.remove();

  const nextActive = sessions[Math.max(0, index - 1)];
  activateSession(activeSessionId === id ? nextActive.id : activeSessionId);
}

function closeSession(id) {
  if (sessions.length <= 1) return;
  if (!sessions.some((session) => session.id === id)) return;

  const tab = sessionTabs.querySelector(`.session-tab[data-session-id="${id}"]`);
  if (!tab || tab.classList.contains('leaving')) {
    teardownSession(id);
    return;
  }

  tab.classList.add('leaving');
  tab.addEventListener('animationend', () => teardownSession(id), { once: true });
}

function createSession(title) {
  const id = sessions.reduce((max, session) => Math.max(max, session.id), 0) + 1;

  const container = document.createElement('div');
  container.className = 'terminal-session';
  terminalHost.append(container);

  const term = new window.Terminal(terminalOptions);
  const fitAddon = new window.FitAddon.FitAddon();
  const ws = new WebSocket(`${proto}://${location.host}`);
  const session = {
    id,
    title: title || `Terminal ${id}`,
    container,
    term,
    fitAddon,
    ws,
    pendingMessages: [],
    pointerDownPos: null,
    isDraggingScrollbar: false,
    lastPointerDownAt: 0,
    pointerClickCount: 0,
  };

  term.loadAddon(fitAddon);
  term.open(container);
  attachScrollbarHitArea(session);
  attachTerminalBehavior(session);

  ws.onmessage = (event) => {
    term.write(event.data);
  };

  ws.onopen = () => {
    resizeSession(session);
    flushPendingMessages(session);
  };

  ws.onclose = () => {
    if (!term.element) return;
    term.write('\r\n[session closed]\r\n');
  };

  sessions.push(session);
  enteringSessionId = id;
  activateSession(id);

  container.classList.add('opening');
  container.addEventListener('animationend', () => container.classList.remove('opening'), { once: true });
}

function updateBroadcastUI() {
  // The group only does anything with 2+ members; treat <2 as "off" for the UI.
  const on = broadcastTargets.size > 1;
  broadcastToggle.classList.toggle('active', on);
  broadcastToggle.setAttribute('aria-pressed', String(on));
  renderTabs();
}

function refocusActive() {
  const active = sessions.find((session) => session.id === activeSessionId);
  if (active) active.term.focus();
}

// Cmd+click: toggle one tab's membership individually.
function toggleBroadcastSingle(id) {
  // Clicking the active tab with no group yet does nothing (no lone self-select).
  if (broadcastTargets.size === 0 && id === activeSessionId) return;
  if (broadcastTargets.has(id)) {
    broadcastTargets.delete(id);
    // A lone remaining tab does nothing on its own — clear the group entirely.
    if (broadcastTargets.size === 1) broadcastTargets.clear();
  } else {
    // Starting a fresh group: include the active tab too, so Cmd-clicking one
    // other tab links both (not just the clicked one).
    if (broadcastTargets.size === 0 && activeSessionId !== null && activeSessionId !== id) {
      broadcastTargets.add(activeSessionId);
    }
    broadcastTargets.add(id);
  }
  updateBroadcastUI();
  refocusActive();
}

// Shift+click: select the contiguous range from the active tab to the clicked
// one. Shift-clicking the same range again clears it (toggle off).
function selectBroadcastRange(id) {
  const anchorIndex = sessions.findIndex((s) => s.id === activeSessionId);
  const clickedIndex = sessions.findIndex((s) => s.id === id);
  if (clickedIndex === -1) return;
  const from = anchorIndex === -1 ? clickedIndex : Math.min(anchorIndex, clickedIndex);
  const to = anchorIndex === -1 ? clickedIndex : Math.max(anchorIndex, clickedIndex);
  const range = sessions.slice(from, to + 1).map((s) => s.id);

  // Same range already selected → deselect.
  const sameRange = range.length === broadcastTargets.size && range.every((rid) => broadcastTargets.has(rid));
  broadcastTargets.clear();
  if (!sameRange) for (const rid of range) broadcastTargets.add(rid);

  updateBroadcastUI();
  refocusActive();
}

// Cmd+Option+click (and the toolbar button): turn broadcast off if any group is
// active, otherwise turn it on for all terminals.
function toggleAllBroadcast() {
  if (broadcastTargets.size > 0) {
    broadcastTargets.clear();
  } else {
    for (const session of sessions) broadcastTargets.add(session.id);
  }
  updateBroadcastUI();
  refocusActive();
}

addSessionButton.addEventListener('click', () => createSession());
broadcastToggle.addEventListener('click', toggleAllBroadcast);

function reopenClosedSession() {
  if (closedTitles.length === 0) return;
  createSession(closedTitles.pop());
}

function closeOtherSessions() {
  const keep = sessions.find((session) => session.id === activeSessionId);
  if (!keep) return;
  for (const session of sessions) {
    if (session.id === keep.id) continue;
    closedTitles.push(session.title);
    session.ws.close();
    session.term.dispose();
    session.container.remove();
  }
  sessions.length = 0;
  sessions.push(keep);
  // Closing tabs turns broadcast off.
  broadcastTargets.clear();
  broadcastToggle.classList.remove('active');
  broadcastToggle.setAttribute('aria-pressed', 'false');
  activateSession(keep.id);
}

// Option+T = new tab, Option+Shift+T = reopen last closed tab. Capture phase so
// xterm doesn't consume the keystroke first. e.code stays "KeyT" even though
// Option+t produces a dead-key character on macOS.
window.addEventListener('keydown', (event) => {
  if (event.metaKey) return;

  // Option+T = new tab, Option+Shift+T = reopen last closed.
  if (event.altKey && !event.ctrlKey && event.code === 'KeyT') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.shiftKey) reopenClosedSession();
    else createSession();
    return;
  }

  // Ctrl+W = close tab, Ctrl+Shift+W = close all others (keep active).
  if (event.ctrlKey && !event.altKey && event.code === 'KeyW') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.shiftKey) closeOtherSessions();
    else if (activeSessionId !== null) closeSession(activeSessionId);
  }
}, true);

window.addEventListener('resize', () => {
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  if (activeSession) resizeSession(activeSession);
});

createSession();
