import { BUTTON_PLAIN } from "./ui";

export interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small in-app yes/no modal. Used instead of window.confirm so it looks
 * the same on every device and never gets suppressed by the browser.
 */
export function ConfirmDialog({ open, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel} // click on the dim background = Cancel
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-message"
        className="flex w-full max-w-sm flex-col gap-4 rounded-md bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()} // clicks inside don't cancel
      >
        <p id="confirm-dialog-message" className="text-sm text-gray-800">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className={BUTTON_PLAIN} autoFocus>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md text-sm border bg-amber-600 text-white border-amber-600 font-medium"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
