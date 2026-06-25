import { terminalOptions } from './terminal-options.js';
import { attachScrollbarHitArea, attachTerminalBehavior, configureTerminalInteractions } from './terminal-interactions.js';

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const terminalHost = document.getElementById('terminalHost');
const sessionTabs = document.getElementById('sessionTabs');
const addSessionButton = document.getElementById('addSession');
const sessions = [];
let activeSessionId = null;
let nextSessionId = 1;
let renamingSessionId = null;

function sendInput(session, data) {
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'input', data }));
    return;
  }
  session.pendingMessages.push({ type: 'input', data });
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
    tab.className = `session-tab${session.id === activeSessionId ? ' active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(session.id === activeSessionId));
    tab.title = session.title;
    tab.addEventListener('click', () => activateSession(session.id));
    tab.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      startRenameSession(session.id);
    });
    tab.addEventListener('dblclick', (event) => {
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

function closeSession(id) {
  if (sessions.length <= 1) return;
  const index = sessions.findIndex((session) => session.id === id);
  if (index === -1) return;

  const [session] = sessions.splice(index, 1);
  session.ws.close();
  session.term.dispose();
  session.container.remove();

  const nextActive = sessions[Math.max(0, index - 1)];
  activateSession(activeSessionId === id ? nextActive.id : activeSessionId);
}

function createSession() {
  const id = nextSessionId;
  nextSessionId += 1;

  const container = document.createElement('div');
  container.className = 'terminal-session';
  terminalHost.append(container);

  const term = new window.Terminal(terminalOptions);
  const fitAddon = new window.FitAddon.FitAddon();
  const ws = new WebSocket(`${proto}://${location.host}`);
  const session = {
    id,
    title: `Session ${id}`,
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
  activateSession(id);
}

addSessionButton.addEventListener('click', createSession);

window.addEventListener('resize', () => {
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  if (activeSession) resizeSession(activeSession);
});

createSession();
