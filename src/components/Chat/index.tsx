/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";

import { marked } from "marked";
import DOMPurify from "dompurify";

import BotIcon from "../../assets/icons/BotIcon";
import UserIcon from "../../assets/icons/UserIcon";

import type { ChatProps } from "./types";

import "./Chat.css";

declare global {
  interface Window {
    MathJax: {
      typesetPromise: any;
      typeset: () => void;
    };
  }
}

export default function Chat({ messages }: ChatProps) {
  const empty = messages.length === 0;

  function render(text: string) {
    return DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  }

  useEffect(() => {
    if (window.MathJax) {
      window.MathJax.typesetPromise()
        .then(() => console.log("MathJax renderizado!"))
        .catch((err: any) => console.error("Erro ao renderizar MathJax:", err));
    } else {
      console.warn("MathJax ainda não carregado.");
    }
  }, [messages]);

  return (
    <div
      className={`flex-1 p-6 max-w-[960px] w-full ${
        empty ? "flex flex-col items-center justify-end" : "space-y-4"
      }`}
    >
      {empty ? (
        <div className="text-xl">Ready!</div>
      ) : (
        messages.map((msg, i) => (
          <div key={`message-${i}`} className="flex items-start space-x-4">
            {msg.role === "assistant" ? (
              <>
                <BotIcon className="h-6 w-6 min-h-6 min-w-6 my-3 text-gray-500 dark:text-gray-300" />
                <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-4">
                  <p className="min-h-6 text-gray-800 dark:text-gray-200 overflow-wrap-anywhere">
                    {msg.image ? (
                      <img
                        src={msg.image}
                        className="max-w-full w-[384px] rounded-md"
                      />
                    ) : msg.content.length > 0 ? (
                      <span
                        className="markdown"
                        dangerouslySetInnerHTML={{
                          __html: render(msg.content),
                        }}
                      />
                    ) : (
                      <span className="h-6 flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-300 rounded-full animate-pulse"></span>
                        <span className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-300 rounded-full animate-pulse animation-delay-200"></span>
                        <span className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-300 rounded-full animate-pulse animation-delay-400"></span>
                      </span>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <UserIcon className="h-6 w-6 min-h-6 min-w-6 my-3 text-gray-500 dark:text-gray-300" />
                <div className="bg-blue-500 text-white rounded-lg p-4">
                  {msg.image && (
                    <img
                      src={msg.image}
                      className="max-w-full max-h-64 rounded-md mb-3"
                    />
                  )}
                  <p className="min-h-6 overflow-wrap-anywhere">
                    {msg.content}
                  </p>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
