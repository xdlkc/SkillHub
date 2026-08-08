import type { ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {title}
          <span className="x" onClick={onClose}>✕</span>
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
        <button className="btn ghost" onClick={onCancel}>取消</button>
        <button className={danger ? 'btn danger' : 'btn primary'} onClick={onConfirm}>{confirmText}</button>
      </div>
    </Modal>
  );
}
