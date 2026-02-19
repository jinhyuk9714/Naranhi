import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MESSAGE_TYPES } from '@naranhi/core';

export default function FloatingButton() {
  const [expanded, setExpanded] = useState(false);
  const [pageEnabled, setPageEnabled] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Initialize position to bottom-right
  useEffect(() => {
    setPosition({
      x: window.innerWidth - 64,
      y: window.innerHeight - 120,
    });
  }, []);

  // Check page state on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_PAGE_STATE })
      .then((resp: { ok: boolean; data: { enabled: boolean } }) => {
        if (resp?.ok) setPageEnabled(resp.data.enabled);
      })
      .catch(() => {});
  }, []);

  const toggleTranslation = useCallback(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TOGGLE_PAGE });
      if ((resp as { ok: boolean; data: { enabled: boolean } })?.ok) {
        setPageEnabled((resp as { ok: boolean; data: { enabled: boolean } }).data.enabled);
      }
    } catch {}
    setExpanded(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!buttonRef.current) return;
    setDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: dragRef.current.offsetX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.offsetY + (e.clientY - dragRef.current.startY),
      });
    };

    const handleUp = () => {
      setDragging(false);
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  const handleClick = useCallback(() => {
    if (!dragging) {
      setExpanded((prev) => !prev);
    }
  }, [dragging]);

  return (
    <div
      ref={buttonRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2147483646,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Expanded Panel */}
      {expanded && (
        <div
          style={{
            position: 'absolute',
            bottom: '52px',
            right: '0',
            width: '200px',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            padding: '12px',
            border: '1px solid #e5e7eb',
          }}
        >
          <button
            onClick={toggleTranslation}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: pageEnabled ? '#fee2e2' : '#0084f4',
              color: pageEnabled ? '#991b1b' : 'white',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {pageEnabled ? 'Stop Translation' : 'Translate Page'}
          </button>
          <button
            onClick={() => {
              chrome.runtime.openOptionsPage();
              setExpanded(false);
            }}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: 'transparent',
              color: '#374151',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Settings
          </button>
        </div>
      )}

      {/* FAB Button */}
      <div
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '22px',
          background: pageEnabled ? '#0084f4' : 'white',
          border: pageEnabled ? 'none' : '1px solid #e5e7eb',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'pointer',
          transition: 'background 0.2s',
          userSelect: 'none',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke={pageEnabled ? 'white' : '#6b7280'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l6 0" />
          <path d="M4 12l8 0" />
          <path d="M5 16l6 0" />
          <path d="M13 4l8 0" />
          <path d="M15 8l6 0" />
          <path d="M13 12l8 0" />
          <path d="M15 16l4 0" />
          <path d="M13 20l6 0" />
        </svg>
      </div>
    </div>
  );
}
