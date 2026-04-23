import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';

export type PolishPurpose =
  | 'summary'
  | 'styleGuide'
  | 'forbiddenRules'
  | 'settingSummary'
  | 'settingContent'
  | 'outlineSummary'
  | 'outlineGoal'
  | 'chapterMustInclude'
  | 'chapterMustAvoid'
  | 'chapterContinuity'
  | 'chapterExtraInstructions';

export interface PolishRequest {
  /**
   * Unique key within the page. `polishing === key` is used to drive the
   * loading state of the corresponding button / textarea, so make sure
   * two buttons on the same page use different keys.
   */
  key: string;
  /** Human-readable label used in toasts and the preview dialog ("摘要" 等). */
  label: string;
  /** Current text pulled from the form field. */
  current: string;
  /** Which backend prompt template to use. */
  purpose: PolishPurpose;
  /**
   * Optional extra context appended to the novel-level hint (e.g.
   * "节点级别：章纲 · 节点标题：第三章"). Helps the model stay on target.
   */
  hint?: string;
}

/**
 * Generic "AI 润色" flow: call the model, diff the result against the
 * current text, preview in a confirm dialog, and surface the polished
 * text to the caller only when the user explicitly accepts.
 *
 * Returns the replacement string on user confirm, or `null` if the user
 * declined, the input was empty, the model returned unchanged text, or
 * the request failed (a toast is shown in every error branch).
 */
export function usePolish(novelId: string | undefined) {
  const toast = useToast();
  const confirm = useConfirm();
  const [polishing, setPolishing] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (input: { text: string; purpose: PolishPurpose; hint?: string }) =>
      api.polishNovelField(novelId!, input),
  });

  const polish = async (req: PolishRequest): Promise<string | null> => {
    const current = (req.current || '').trim();
    if (!current) {
      toast.info(`「${req.label}」为空，请先填写再润色`);
      return null;
    }
    if (!novelId) {
      toast.error('当前未绑定小说');
      return null;
    }
    try {
      setPolishing(req.key);
      const res = await mut.mutateAsync({
        text: current,
        purpose: req.purpose,
        hint: req.hint,
      });
      if (res.text === current) {
        toast.info('模型返回内容与原文一致');
        return null;
      }
      const ok = await confirm({
        title: `AI 润色 · ${req.label}`,
        message:
          `模型：${res.providerName} · ${res.model}\n\n` +
          `原文（${current.length} 字）与润色结果（${res.text.length} 字）已准备好。\n` +
          `确认替换当前输入？（替换后仍需点"保存"才会写入数据库）\n\n` +
          `— 润色结果预览 —\n${res.text}`,
        confirmText: '替换',
        cancelText: '放弃',
        tone: 'primary',
      });
      if (!ok) return null;
      toast.success(`${req.label}已润色`);
      return res.text;
    } catch (e) {
      toast.error(`润色失败：${(e as Error).message}`);
      return null;
    } finally {
      setPolishing(null);
    }
  };

  return { polish, polishing };
}
