/**
 * Lightweight "AI 润色" trigger, designed to sit next to a form field's
 * label (not inside the input). Renders as a low-visual-weight text link
 * with clearly distinct enabled / disabled / loading states.
 */
export function PolishButton({
  onClick,
  loading,
  disabled,
  title = '调用 AI 模型润色当前文本（默认使用「摘要/记忆」模型，若未配置则回落到生成默认）',
  label = 'AI 润色',
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  title?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs leading-none font-medium text-brand-500 hover:text-white disabled:font-normal disabled:text-ink-500 disabled:cursor-not-allowed disabled:hover:text-ink-500 transition-colors"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? (
        <>
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span>润色中…</span>
        </>
      ) : (
        <>
          <span aria-hidden className="text-[13px]">✨</span>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
