import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

export const MarkdownViewer: React.FC<Props> = ({ content }) => {
  return (
    <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return (
              <pre className="not-prose my-2 p-2.5 rounded-xl bg-slate-200/50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 border border-slate-300/50 dark:border-slate-800 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
                {children}
              </pre>
            );
          },
          code({ inline, className, children, ...props }: any) {
            if (inline) {
              return (
                <code
                  className="not-prose bg-slate-200/50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-300/40 dark:border-slate-700/50 font-medium"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="font-mono text-xs text-slate-800 dark:text-slate-200" {...props}>
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-xs">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="bg-slate-100 dark:bg-slate-800 px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                {children}
              </td>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 px-4 py-2 italic text-slate-700 dark:text-slate-300 my-2 rounded-r-md">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
