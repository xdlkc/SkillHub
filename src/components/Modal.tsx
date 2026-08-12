import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !modal.contains(focused)) {
      const initial = modal.querySelector<HTMLElement>('[data-autofocus]')
        ?? modal.querySelector<HTMLElement>(FOCUSABLE)
        ?? modal;
      initial.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !modal.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>
          {title}
          <button className="x" type="button" aria-label="关闭" onClick={onClose}>✕</button>
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, message, confirmText = '确认删除', danger = true, onConfirm, onCancel,
}: {
  title: string; message: string; confirmText?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ color: 'var(--dim)', fontSize: 13.5, marginBottom: 8 }}>{message}</p>
      <div className="modal-actions">
        <button className="btn ghost" type="button" data-autofocus onClick={onCancel}>取消</button>
        <button className={danger ? 'btn danger' : 'btn primary'} type="button" onClick={onConfirm}>{confirmText}</button>
      </div>
    </Modal>
  );
}
