'use client';

import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  'Excelのフォーマットが変わって取り込めない',
  '仕訳の金額が0になる',
  'CSVが文字化けする',
  '税区分が正しく入らない',
];

export default function ClaudeChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'こんにちは！アプリの使い方や、データ取り込みの問題についてお気軽にご相談ください。\n\nよくある質問をクリックするか、直接お書きください。',
      }]);
    }
  }, [open, messages.length]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'エラーが発生しました');
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function reset() {
    setMessages([]);
    setInput('');
    setError('');
  }

  return (
    <>
      {/* フローティングボタン */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#1a237e] text-white shadow-lg hover:bg-[#283593] transition-colors flex items-center justify-center"
        title="Claudeに相談"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <span className="text-xl">💬</span>
        )}
      </button>

      {/* チャットパネル */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[560px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col">
          {/* ヘッダー */}
          <div className="bg-[#1a237e] text-white px-4 py-3 rounded-t-xl flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-sm font-bold">Claude サポート</p>
              <p className="text-xs text-blue-200">アプリの使い方・修正依頼</p>
            </div>
            <button
              onClick={reset}
              className="text-blue-200 hover:text-white text-xs"
              title="会話をリセット"
            >
              リセット
            </button>
          </div>

          {/* メッセージ一覧 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#1a237e] text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-3 py-2 rounded-lg rounded-bl-sm">
                  <span className="text-sm text-gray-400">考え中</span>
                  <span className="inline-flex gap-0.5 ml-1">
                    {[0, 1, 2].map(n => (
                      <span key={n} className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${n * 0.15}s` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* クイック質問（最初のみ） */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 入力エリア */}
          <div className="border-t border-gray-200 p-3 flex gap-2 flex-shrink-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="質問を入力（Enterで送信、Shift+Enterで改行）"
              className="flex-1 resize-none text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[60px] max-h-[120px]"
              rows={2}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="px-3 bg-[#1a237e] text-white rounded-lg hover:bg-[#283593] disabled:opacity-40 transition-colors flex-shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
