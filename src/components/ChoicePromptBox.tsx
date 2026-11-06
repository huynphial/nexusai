import React, { useState } from 'react';
import { ChoicePromptData } from '../types';
import { ListFilter, Check, CheckSquare, Square, Send, Layers } from 'lucide-react';

interface Props {
  data: ChoicePromptData;
  onSelect: (reply: string) => void;
  disabled?: boolean;
}

export const ChoicePromptBox: React.FC<Props> = ({ data, onSelect, disabled = false }) => {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [isMultiMode, setIsMultiMode] = useState<boolean>(Boolean(data.multiple));
  const [submittedChoice, setSubmittedChoice] = useState<string | null>(null);

  if (!data || !data.options || data.options.length === 0) {
    return null;
  }

  const prefix = data.prefix || 'Chọn: ';

  const handleSingleClick = (val: string) => {
    if (disabled || submittedChoice) return;
    const replyText = `${prefix}${val}`;
    setSubmittedChoice(replyText);
    onSelect(replyText);
  };

  const handleToggleOption = (val: string) => {
    if (disabled || submittedChoice) return;
    if (selectedValues.includes(val)) {
      setSelectedValues(selectedValues.filter((v) => v !== val));
    } else {
      setSelectedValues([...selectedValues, val]);
    }
  };

  const handleConfirmMulti = () => {
    if (disabled || submittedChoice || selectedValues.length === 0) return;
    const replyText = `${prefix}${selectedValues.join('; ')}`;
    setSubmittedChoice(replyText);
    onSelect(replyText);
  };

  const handleSelectAll = () => {
    if (disabled || submittedChoice || !data.all) return;
    const replyText = data.all.reply || 'tất cả';
    setSubmittedChoice(replyText);
    onSelect(replyText);
  };

  return (
    <div className="mt-3 p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/50 dark:from-slate-900/90 dark:to-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 shadow-2xs text-xs space-y-3 transition-all animate-in fade-in duration-200">
      {/* Header Prompt */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 text-indigo-950 dark:text-indigo-200 font-semibold">
          <ListFilter className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <span>{data.prompt || 'Bạn muốn chọn dịch vụ nào?'}</span>
        </div>

        {/* Toggle Multi-select mode if multiple is supported */}
        {data.multiple && !submittedChoice && !disabled && (
          <button
            type="button"
            onClick={() => setIsMultiMode(!isMultiMode)}
            className="text-[10px] px-2 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3" />
            <span>{isMultiMode ? 'Chọn đơn' : 'Chọn nhiều'}</span>
          </button>
        )}
      </div>

      {/* Submitted Badge State */}
      {submittedChoice ? (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            Đã gửi lựa chọn: <b>{submittedChoice}</b>
          </span>
        </div>
      ) : (
        <>
          {/* Options List */}
          <div className="space-y-2">
            {data.options.map((opt, idx) => {
              const isChecked = selectedValues.includes(opt.value);

              if (isMultiMode) {
                return (
                  <div
                    key={idx}
                    onClick={() => !disabled && handleToggleOption(opt.value)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      isChecked
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-800 dark:text-slate-100'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-white" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`font-bold text-xs ${isChecked ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                        {opt.label}
                      </div>
                      {opt.description && (
                        <div
                          className={`text-[11px] mt-0.5 leading-tight ${
                            isChecked ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {opt.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSingleClick(opt.value)}
                  className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/60 border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-700 transition-all text-slate-900 dark:text-slate-100 shadow-2xs group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="font-bold text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {opt.label}
                  </div>
                  {opt.description && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      {opt.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Bar (Multi-select confirm & All buttons) */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {data.all && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {data.all.label || 'Tất cả'}
                </button>
              )}
            </div>

            {isMultiMode && (
              <button
                type="button"
                disabled={disabled || selectedValues.length === 0}
                onClick={handleConfirmMulti}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Xác nhận ({selectedValues.length})</span>
              </button>
            )}
          </div>

          {/* Note footer */}
          {data.note && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic pt-0.5 leading-tight">
              {data.note}
            </p>
          )}
        </>
      )}
    </div>
  );
};
