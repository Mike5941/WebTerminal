let sendInput = null;

export function configureTerminalInteractions(deps) {
  sendInput = deps.sendInput;
}

function readSelectionPosition(session) {
  const { term } = session;
  if (!term.hasSelection() || typeof term.getSelectionPosition !== 'function') return null;
  const position = term.getSelectionPosition();
  if (!position) return null;

  // getSelectionPosition() returns absolute buffer rows, but every caller
  // here (cursorY-based row checks, viewport pixel math) works in
  // viewport-relative rows. Convert once so callers stay consistent.
  const viewportY = term.buffer.active.viewportY;
  return {
    startColumn: position.startColumn ?? position.start?.x,
    startRow: (position.startRow ?? position.start?.y) - viewportY,
    endColumn: position.endColumn ?? position.end?.x,
    endRow: (position.endRow ?? position.end?.y) - viewportY,
  };
}

function deleteSelectedInput(session) {
  const { term } = session;
  const selection = readSelectionPosition(session);
  if (!selection) return false;

  const { startColumn, startRow, endColumn, endRow } = selection;
  if ([startColumn, startRow, endColumn, endRow].some((value) => typeof value !== 'number')) return false;
  if (startRow !== endRow || startRow !== term.buffer.active.cursorY) return false;

  const absRow = term.buffer.active.baseY + startRow;
  const deleteChars = countCharsBetweenColumns(term.buffer.active, absRow, startColumn, endColumn);
  if (deleteChars <= 0) return false;

  const cursorColumn = term.buffer.active.cursorX;
  const moveCharsEnd = countCharsBetweenColumns(term.buffer.active, absRow, cursorColumn, endColumn);
  const moveSeq = endColumn > cursorColumn
    ? '\x1b[C'.repeat(moveCharsEnd)
    : '\x1b[D'.repeat(moveCharsEnd);

  term.clearSelection();
  sendInput(session, `${moveSeq}${'\x7f'.repeat(deleteChars)}`);
  return true;
}

function getTerminalGeometry(session) {
  const screenEl = session.term.element.querySelector('.xterm-screen');
  const cursorEl = session.term.element.querySelector('.xterm-cursor');
  if (!screenEl || !cursorEl) return null;

  const screenRect = screenEl.getBoundingClientRect();
  const cursorRect = cursorEl.getBoundingClientRect();
  const cellWidth = cursorRect.width || screenRect.width / session.term.cols;
  const cellHeight = cursorRect.height || screenRect.height / session.term.rows;

  return { screenRect, cursorRect, cellWidth, cellHeight };
}

function showCopyToast(point) {
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = '출력 복사됨';
  toast.style.left = `${point.x}px`;
  toast.style.top = `${point.y}px`;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 900);
}

// Heuristic block-copy: relies on the powerlevel10k box prompt markers
// (╭─ ... / ╰─❯ ...) to find where the clicked command's output starts and
// ends. Breaks if the prompt theme/style changes.
function findCommandOutputRange(session, absRow) {
  const buf = session.term.buffer.active;
  const lineText = (i) => buf.getLine(i)?.translateToString(true).trimStart() ?? null;

  let promptRow = -1;
  for (let i = absRow; i >= 0; i -= 1) {
    const text = lineText(i);
    if (text !== null && text.startsWith('╰─❯')) {
      promptRow = i;
      break;
    }
  }
  if (promptRow === -1) return null;

  let endRow = buf.length - 1;
  for (let i = promptRow + 1; i < buf.length; i += 1) {
    const text = lineText(i);
    if (text !== null && text.startsWith('╭─')) {
      endRow = i - 1;
      break;
    }
  }

  const startRow = promptRow + 1;
  while (endRow >= startRow && (lineText(endRow) ?? '') === '') endRow -= 1;
  if (endRow < startRow) return null;

  return { startRow, endRow };
}

async function copyCommandOutputAt(session, point) {
  const geometry = getTerminalGeometry(session);
  if (!geometry) return false;

  const { screenRect, cellHeight } = geometry;
  const clickRow = Math.floor((point.y - screenRect.top) / cellHeight);
  const buf = session.term.buffer.active;
  const range = findCommandOutputRange(session, buf.baseY + clickRow);
  if (!range) return false;

  const text = [];
  for (let i = range.startRow; i <= range.endRow; i += 1) {
    text.push(buf.getLine(i)?.translateToString(true) ?? '');
  }
  await navigator.clipboard.writeText(text.join('\n'));
  showCopyToast(point);
  return true;
}

function moveCursorToPointer(session, point) {
  const geometry = getTerminalGeometry(session);
  if (!geometry) return false;

  const { screenRect, cursorRect, cellWidth, cellHeight } = geometry;
  const clickRow = Math.floor((point.x - screenRect.left) / cellWidth);
  const clickLine = Math.floor((point.y - screenRect.top) / cellHeight);
  const cursorCol = Math.max(0, Math.min(session.term.cols - 1, Math.round((cursorRect.left - screenRect.left) / cellWidth)));
  const cursorLine = Math.floor((cursorRect.top - screenRect.top) / cellHeight);

  if (clickLine !== cursorLine) return false;

  const clickCol = Math.max(0, Math.min(session.term.cols - 1, clickRow));
  const delta = clickCol - cursorCol;
  if (delta === 0) return true;

  const seq = delta > 0 ? '\x1b[C' : '\x1b[D';
  sendInput(session, seq.repeat(Math.abs(delta)));
  return true;
}

function clearClickSelection(session) {
  session.term.clearSelection();
}

function clearTerminalSelection(session) {
  session.term.clearSelection();
  window.getSelection()?.removeAllRanges();
}

function clearTerminalSelectionSoon(session) {
  clearTerminalSelection(session);
  window.requestAnimationFrame(() => clearTerminalSelection(session));
  window.setTimeout(() => clearTerminalSelection(session), 0);
  window.setTimeout(() => clearTerminalSelection(session), 30);
}

function suppressSelection(session) {
  session.container.classList.add('suppress-selection');
}

function unsuppressSelection(session) {
  session.container.classList.remove('suppress-selection');
}

function syncScrollThumbDrag(session, pointerY) {
  const viewport = session.term.element.querySelector('.xterm-viewport');
  if (!viewport || viewport.scrollHeight <= viewport.clientHeight) return;

  const rect = viewport.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
  viewport.scrollTop = ratio * (viewport.scrollHeight - viewport.clientHeight);
}

export function attachScrollbarHitArea(session) {
  const hitArea = document.createElement('div');
  hitArea.className = 'scrollbar-hit-area';
  hitArea.setAttribute('aria-hidden', 'true');
  session.container.append(hitArea);

  hitArea.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    session.isDraggingScrollbar = true;
    hitArea.setPointerCapture(event.pointerId);
    syncScrollThumbDrag(session, event.clientY);
    clearClickSelection(session);
  });

  hitArea.addEventListener('pointermove', (event) => {
    if (!session.isDraggingScrollbar) return;
    event.preventDefault();
    event.stopPropagation();
    syncScrollThumbDrag(session, event.clientY);
    clearClickSelection(session);
  });

  hitArea.addEventListener('pointerup', (event) => {
    if (!session.isDraggingScrollbar) return;
    event.preventDefault();
    event.stopPropagation();
    session.isDraggingScrollbar = false;
    hitArea.releasePointerCapture(event.pointerId);
    clearClickSelection(session);
  });
}

function getCommandStartCol(buf, absRow) {
  const line = buf.getLine(absRow);
  if (!line) return 0;
  let lastPromptCol = -1;
  for (let c = 0; c < line.length; c++) {
    const char = line.getCell(c)?.getChars();
    if (char === '❯' || char === '>' || char === '%') lastPromptCol = c;
  }
  if (lastPromptCol !== -1) {
    let c = lastPromptCol + 1;
    while (c < line.length && line.getCell(c)?.getChars() === ' ') c++;
    return c;
  }
  return 0;
}

function getCommandEndCol(buf, absRow) {
  const line = buf.getLine(absRow);
  if (!line) return 0;
  let c = line.length - 1;
  while (c >= 0) {
    const cell = line.getCell(c);
    if (cell && cell.getChars().trim() !== '') return c + (cell.getWidth() === 2 ? 2 : 1);
    c--;
  }
  return 0;
}

function countCharsBetweenColumns(buf, absRow, colA, colB) {
  const line = buf.getLine(absRow);
  if (!line) return 0;
  let count = 0;
  const start = Math.min(colA, colB);
  const end = Math.max(colA, colB);
  for (let c = start; c < end; c++) {
    const cell = line.getCell(c);
    if (cell && cell.getChars() !== '') {
      count++;
    }
  }
  return count;
}

function handleKeyboardSelection(session, e) {
  if (!e.shiftKey) {
    session.keyboardSelectionAnchor = null;
    return false;
  }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
    session.keyboardSelectionAnchor = null;
    return false;
  }


  const term = session.term;
  const buf = term.buffer.active;
  const absRow = buf.baseY + buf.cursorY;
  const lineText = buf.getLine(absRow)?.translateToString(true) ?? '';

  if (!term.hasSelection() || session.keyboardSelectionAnchor == null) {
    session.keyboardSelectionAnchor = buf.cursorX;
    session.keyboardSelectionCursor = buf.cursorX;
  }

  const anchor = session.keyboardSelectionAnchor;
  let cursor = session.keyboardSelectionCursor;

  const line = buf.getLine(absRow);

  const getCharForCol = (c) => {
    if (!line) return '';
    let cell = line.getCell(c);
    if (!cell) return '';
    if (cell.getWidth() === 0 && c > 0) {
      cell = line.getCell(c - 1);
      if (!cell || cell.getWidth() !== 2) return '';
    }
    return cell.getChars() || '';
  };

  const isWordChar = (c) => {
    const char = getCharForCol(c);
    if (!char || char.trim() === '') return false;
    return !/[\/\\()"'=,;:<>[\]{}|]/.test(char);
  };

  if (e.metaKey && e.key === 'ArrowLeft') {
    cursor = getCommandStartCol(buf, absRow);
  } else if (e.metaKey && e.key === 'ArrowRight') {
    cursor = getCommandEndCol(buf, absRow);
  } else if (e.altKey && e.key === 'ArrowLeft') {
    let col = cursor - 1;
    while (col >= 0 && !isWordChar(col)) col--;
    while (col >= 0 && isWordChar(col)) col--;
    cursor = Math.max(0, col + 1);
    const minCol = getCommandStartCol(buf, absRow);
    if (cursor < minCol) cursor = minCol;
  } else if (e.altKey && e.key === 'ArrowRight') {
    let col = cursor;
    while (col < term.cols && !isWordChar(col)) {
      if (getCharForCol(col) === '') break;
      col++;
    }
    while (col < term.cols && isWordChar(col)) col++;
    cursor = Math.min(term.cols, col);
    const maxCol = getCommandEndCol(buf, absRow);
    if (cursor > maxCol) cursor = maxCol;
  } else if (!e.metaKey && !e.altKey && e.key === 'ArrowLeft') {
    let col = cursor - 1;
    if (col >= 0) {
      const cell = buf.getLine(absRow)?.getCell(col);
      if (cell && cell.getWidth() === 0) col--;
    }
    cursor = Math.max(0, col);
    const minCol = getCommandStartCol(buf, absRow);
    if (cursor < minCol) cursor = minCol;
  } else if (!e.metaKey && !e.altKey && e.key === 'ArrowRight') {
    let col = cursor;
    if (col < term.cols) {
      const cell = buf.getLine(absRow)?.getCell(col);
      if (cell && cell.getWidth() === 2) col += 2;
      else col += 1;
    }
    cursor = Math.min(term.cols, col);
    const maxCol = getCommandEndCol(buf, absRow);
    if (cursor > maxCol) cursor = maxCol;
  }

  const prevCursor = session.keyboardSelectionCursor;
  session.keyboardSelectionCursor = cursor;

  const charDelta = countCharsBetweenColumns(buf, absRow, prevCursor, cursor);
  if (cursor > prevCursor) {
    sendInput(session, '\x1b[C'.repeat(charDelta));
  } else if (cursor < prevCursor) {
    sendInput(session, '\x1b[D'.repeat(charDelta));
  }

  const startCol = Math.min(anchor, cursor);
  const endCol = Math.max(anchor, cursor);
  const length = endCol - startCol;

  if (length > 0) {
    // term.select uses 0-indexed row. It's safe to assume absolute row.
    term.select(startCol, buf.cursorY, length);
  } else {
    term.clearSelection();
  }

  e.preventDefault();
  return true;
}


export function attachTerminalBehavior(session) {
  const { term } = session;

  term.onData((data) => {
    sendInput(session, data);
  });

  term.element.addEventListener('keydown', (e) => {
    if (!e.metaKey || e.altKey || e.shiftKey) return;

    if (e.key === 'ArrowLeft' || e.key === 'Home') {
      e.preventDefault();
      e.stopImmediatePropagation();
      session.keyboardSelectionAnchor = null;
      clearTerminalSelectionSoon(session);
      sendInput(session, '\x01');
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'End') {
      e.preventDefault();
      e.stopImmediatePropagation();
      session.keyboardSelectionAnchor = null;
      clearTerminalSelectionSoon(session);
      sendInput(session, '\x05');
    }
  }, true);

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;

    if (e.key === 'Meta') {
      return false;
    }

    if (e.metaKey && e.key.toLowerCase() === 'c' && term.hasSelection()) {
      // Selecting into the empty area below short output makes xterm append a
      // blank line per empty row. Strip trailing blank lines before copying.
      const text = term.getSelection().replace(/\s+$/, '');
      if (text) {
        e.preventDefault();
        navigator.clipboard.writeText(text);
        return false;
      }
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && deleteSelectedInput(session)) {
      e.preventDefault();
      return false;
    }

    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (handleKeyboardSelection(session, e)) return false;
    }

    if (e.altKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      session.keyboardSelectionAnchor = null;
      if (term.hasSelection()) term.clearSelection();
      sendInput(session, e.key === 'ArrowLeft' ? '\x1bb' : '\x1bf');
      return false;
    }

    // Clear anchor and selection if a non-shift cursor movement occurs
    if (!e.shiftKey && e.key.startsWith('Arrow')) {
      session.keyboardSelectionAnchor = null;
      if (term.hasSelection()) term.clearSelection();
    }

    if (!e.metaKey) return true;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      sendInput(session, '\x01');
      return false;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      sendInput(session, '\x05');
      return false;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      sendInput(session, '\x15');
      return false;
    }
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      sendInput(session, '\x1f');
      return false;
    }
    return true;
  });

  term.element.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;

    // PointerEvent.detail is always 0 (click-count only exists on the
    // legacy click/dblclick MouseEvents), so track double/triple-click
    // ourselves via timing, the same way browsers do internally.
    const now = performance.now();
    session.pointerClickCount = now - session.lastPointerDownAt < 400 ? session.pointerClickCount + 1 : 1;
    session.lastPointerDownAt = now;

    if (session.pointerClickCount > 1) {
      unsuppressSelection(session);
    } else {
      suppressSelection(session);
    }
    session.pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  term.element.addEventListener('pointermove', (e) => {
    const downPos = session.pointerDownPos;
    if (!downPos) return;

    const geometry = getTerminalGeometry(session);
    if (!geometry) return;

    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > geometry.cellWidth) {
      unsuppressSelection(session);
    }
  });

  term.element.addEventListener('pointerup', (e) => {
    const downPos = session.pointerDownPos;
    session.pointerDownPos = null;
    if (!downPos) return;
    if (session.pointerClickCount > 1) {
      unsuppressSelection(session);
      return;
    }

    const geometry = getTerminalGeometry(session);
    if (!geometry) return;

    const isDrag = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > geometry.cellWidth;

    if (isDrag) {
      moveCursorToPointer(session, { x: e.clientX, y: e.clientY });
      unsuppressSelection(session);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    clearClickSelection(session);

    moveCursorToPointer(session, downPos);
    clearClickSelection(session);
    setTimeout(() => unsuppressSelection(session), 90);
  });

  term.element.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    copyCommandOutputAt(session, { x: e.clientX, y: e.clientY });
  });
}
