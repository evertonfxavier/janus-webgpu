/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from "react";

import StopIcon from "./assets/icons/StopIcon";
import ImageIcon from "./assets/icons/ImageIcon";

import Chat from "./components/Chat";
import Progress from "./components/Progress";
import ImagePreview from "./components/ImagePreview";
import ArrowRightIcon from "./assets/icons/ArrowRightIcon";
import { EXAMPLES } from "./constants/examples";

const IS_WEBGPU_AVAILABLE = !!(navigator as any).gpu;
const STICKY_SCROLL_THRESHOLD = 120;

function App() {
  const worker = useRef<any>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const imageUploadRef = useRef(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | null>(
    null
  );
  const [error, setError] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [progressItems, setProgressItems] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    { role: string; content: string; image: string | null }[]
  >([]);
  const [tps, setTps] = useState<number | null>(null);
  const [numTokens, setNumTokens] = useState(null);
  const [imageProgress, setImageProgress] = useState(null);
  const [imageGenerationTime, setImageGenerationTime] = useState(null);

  function onEnter(message: string, img?: string | null | undefined) {
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, image: img ?? image },
    ]);
    setTps(null);
    setIsRunning(true);
    setInput("");
    setImage(null);
    setNumTokens(null);
    setImageProgress(null);
    setImageGenerationTime(null);
  }

  function onInterrupt() {
    worker.current.postMessage({ type: "interrupt" });
  }

  function resizeInput() {
    if (!textareaRef.current) return;

    const target = textareaRef.current;
    target.style.height = "auto";
    const newHeight = Math.min(Math.max(target.scrollHeight, 24), 200);
    target.style.height = `${newHeight}px`;
  }

  useEffect(() => {
    resizeInput();
  }, [input]);

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
      worker.current.postMessage({ type: "check" }); 
    }

    const onMessageReceived = (e: any) => {
      switch (e.data.status) {
        case "success":
          setStatus("idle");
          break;
        case "error":
          setError(e.data.data);
          break;

        case "loading":
          setStatus("loading");
          setLoadingMessage(e.data.data);
          break;

        case "initiate":
          setProgressItems((prev) => [...prev, e.data]);
          break;

        case "progress":
          setProgressItems((prev) =>
            prev.map((item) => {
              if (item.file === e.data.file) {
                return { ...item, ...e.data };
              }
              return item;
            })
          );
          break;

        case "done":
          setProgressItems((prev) =>
            prev.filter((item) => item.file !== e.data.file)
          );
          break;

        case "ready":
          setStatus("ready");
          break;

        case "start":
          {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "", image: null },
            ]);
          }
          break;

        case "text-update": {
          const { output, tps, numTokens } = e.data;
          setTps(tps);
          setNumTokens(numTokens);
          setMessages((prev) => {
            const cloned = [...prev];
            const last = cloned.at(-1);
            cloned[cloned.length - 1] = {
              role: last?.role ?? "assistant",
              content: (last?.content ?? "") + output,
              image: last?.image ?? null,
            };
            return cloned;
          });
          break;
        }

        case "image-update": {
          const { blob, progress, time } = e.data;

          if (blob) {
            const url = URL.createObjectURL(blob);
            setMessages((prev) => {
              const cloned = [...prev];
              const last: any = cloned.at(-1);
              cloned[cloned.length - 1] = {
                ...last,
                image: url,
              };
              return cloned;
            });
          } else {
            setImageProgress(progress);
            setImageGenerationTime(time);
          }
          break;
        }

        case "complete":
          setIsRunning(false);
          break;
      }
    };

    const onErrorReceived = (e: any) => {
      console.error("Worker error:", e);
    };

    worker.current.addEventListener("message", onMessageReceived);
    worker.current.addEventListener("error", onErrorReceived);

    return () => {
      worker.current.removeEventListener("message", onMessageReceived);
      worker.current.removeEventListener("error", onErrorReceived);
    };
  }, []);

  useEffect(() => {
    if (messages.filter((x) => x.role === "user").length === 0) {
      return;
    }
    if (messages.at(-1)?.role === "assistant") {
      return;
    }
    setTps(null);
    if (worker.current) {
      worker.current.postMessage({ type: "generate", data: messages });
    }
  }, [messages, isRunning]);

  useEffect(() => {
    if (!chatContainerRef.current || !isRunning) return;
    const element = chatContainerRef.current;
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICKY_SCROLL_THRESHOLD
    ) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, isRunning]);

  return IS_WEBGPU_AVAILABLE ? (
    <div className="flex flex-col h-screen mx-auto items justify-end text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900">
      {(status === null || status === "idle") && messages.length === 0 && (
        <div className="h-full overflow-auto scrollbar-thin flex justify-center items-center flex-col relative">
          <div className="flex flex-col items-center mb-1 max-w-[350px] text-center">
            <img
              src="logo.png"
              width="80%"
              height="auto"
              className="block"
            ></img>
            <h1 className="text-5xl font-bold mb-1">Janus WebGPU</h1>
          </div>

          <div className="flex flex-col items-center px-4">
            <p className="max-w-[452px] mb-4">
              <br />
              You are about to load{" "}
              <a
                href="https://huggingface.co/onnx-community/Janus-1.3B-ONNX"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                Janus-1.3B
              </a>
              , a multimodal vision-language model that is optimized for
              inference on the web. Everything runs 100% locally in your browser
              with{" "}
              <a
                href="https://huggingface.co/docs/transformers.js"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                🤗&nbsp;Transformers.js
              </a>{" "}
              and ONNX Runtime Web, meaning no data is sent to a server. Once
              the model has loaded, it can even be used offline. The source code
              for the demo can be found on{" "}
              <a
                href="https://github.com/huggingface/transformers.js-examples/tree/main/janus-webgpu"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                GitHub
              </a>
              .
            </p>

            {error && (
              <div className="text-red-500 text-center mb-2">
                <p className="mb-1">
                  Unable to load model due to the following error:
                </p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {!error && (
              <button
                className="border px-4 py-2 rounded-lg bg-blue-400 text-white hover:bg-blue-500 disabled:bg-blue-100 disabled:cursor-not-allowed select-none"
                onClick={() => {
                  worker.current.postMessage({ type: "load" });
                  setStatus("loading");
                }}
              >
                {status === null ? "Running feature checks..." : "Load model"}
              </button>
            )}
          </div>
        </div>
      )}
      {status === "loading" && (
        <>
          <div className="w-full max-w-[500px] text-left mx-auto p-4 bottom-0 mt-auto">
            <p className="text-center mb-1">{loadingMessage}</p>
            {progressItems.map(({ file, progress, total }, i) => (
              <Progress
                key={i}
                text={file}
                percentage={progress}
                total={total}
              />
            ))}
          </div>
        </>
      )}

      {status === "ready" && (
        <div
          ref={chatContainerRef}
          className="overflow-y-auto scrollbar-thin w-full flex flex-col items-center h-full"
        >
          <Chat messages={messages} />
          {messages.length === 0 && !image && (
            <div className="flex flex-col center">
              {EXAMPLES.map(({ display, prompt, image }, i) => (
                <div
                  key={i}
                  className="max-w-[600px] m-1 border dark:border-gray-600 rounded-md p-2 bg-gray-100 dark:bg-gray-700 cursor-pointer"
                  onClick={() => onEnter(prompt, image)}
                >
                  {display ?? prompt}
                </div>
              ))}
            </div>
          )}

          <p className="text-center text-sm min-h-6 text-gray-500 dark:text-gray-300">
            {messages.length > 0 && (
              <>
                {tps ? (
                  <>
                    {!isRunning && (
                      <span>
                        Generated {numTokens} tokens in{" "}
                        {numTokens ? (numTokens / tps).toFixed(2) : "0.00"}{" "}
                        seconds&nbsp;&#40;
                      </span>
                    )}
                    <span className="font-medium font-mono text-center mr-1 text-black dark:text-white">
                      {tps ? tps.toFixed(2) : "0.00"}
                    </span>
                    <span className="text-gray-500 dark:text-gray-300">
                      tokens/second
                    </span>
                    {!isRunning && <span className="mr-1">&#41;.</span>}
                  </>
                ) : (
                  imageProgress && (
                    <>
                      {isRunning ? (
                        <>
                          <span>Generating image...</span>&nbsp;&#40;
                          <span className="font-medium font-mono text-center text-black dark:text-white">
                            {(imageProgress * 100).toFixed(2)}%
                          </span>
                          <span className="mr-1">&#41;</span>
                        </>
                      ) : (
                        <span>
                          Generated image in{" "}
                          {((imageGenerationTime ?? 0) / 1000).toFixed(2)}{" "}
                          seconds.&nbsp;
                        </span>
                      )}
                    </>
                  )
                )}

                {!isRunning && (
                  <span
                    className="underline cursor-pointer"
                    onClick={() => setMessages([])}
                  >
                    Reset
                  </span>
                )}
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-2 border dark:bg-gray-700 rounded-lg w-[600px] max-w-[80%] max-h-[200px] mx-auto relative mb-3 flex">
        <label
          htmlFor="file-upload"
          className={
            status === "ready"
              ? "cursor-pointer"
              : "cursor-not-allowed pointer-events-none"
          }
        >
          <ImageIcon
            className={`h-8 w-8 p-1 rounded-md ${
              status === "ready"
                ? "text-gray-800 dark:text-gray-100"
                : "text-gray-400 dark:text-gray-500"
            } absolute bottom-3 left-1.5`}
          ></ImageIcon>
          <input
            ref={imageUploadRef}
            id="file-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onInput={(e) => {
              const target = e.target as HTMLInputElement;
              if (!target || !target.files || target.files.length === 0) {
                return;
              }

              const file = target.files[0];
              const reader = new FileReader();

              reader.onload = (e2) => {
                if (e2.target && e2.target.result) {
                  setImage(e2.target.result as string);
                }
                target.value = "";
              };

              reader.readAsDataURL(file);
            }}
          ></input>
        </label>
        <div className="w-full flex flex-col">
          {image && (
            <ImagePreview
              onRemove={() => {
                setImage(null);
              }}
              src={image}
              className="w-20 h-20 min-w-20 min-h-20 relative p-2"
            />
          )}

          <textarea
            ref={textareaRef}
            className="scrollbar-thin w-full pl-11 pr-12 dark:bg-gray-700 py-4 rounded-lg bg-transparent border-none outline-none text-gray-800 disabled:text-gray-400 dark:text-gray-100 placeholder-gray-500 disabled:placeholder-gray-200 dark:placeholder-gray-300 dark:disabled:placeholder-gray-500 resize-none disabled:cursor-not-allowed"
            placeholder="Type message or use '/imagine <prompt>' to generate an image."
            rows={1}
            value={input}
            disabled={status !== "ready"}
            title={
              status === "ready" ? "Model is ready" : "Model not loaded yet"
            }
            onKeyDown={(e) => {
              if (
                input.length > 0 &&
                !isRunning &&
                e.key === "Enter" &&
                !e.shiftKey
              ) {
                e.preventDefault();
                onEnter(input, image);
              }
            }}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          />
        </div>
        {isRunning ? (
          <div className="cursor-pointer" onClick={onInterrupt}>
            <StopIcon className="h-8 w-8 p-1 rounded-md text-gray-800 dark:text-gray-100 absolute right-3 bottom-3" />
          </div>
        ) : input.length > 0 ? (
          <div className="cursor-pointer" onClick={() => onEnter(input)}>
            <ArrowRightIcon
              className={`h-8 w-8 p-1 bg-gray-800 dark:bg-gray-100 text-white dark:text-black rounded-md absolute right-3 bottom-3`}
            />
          </div>
        ) : (
          <div>
            <ArrowRightIcon
              className={`h-8 w-8 p-1 bg-gray-200 dark:bg-gray-600 text-gray-50 dark:text-gray-800 rounded-md absolute right-3 bottom-3`}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center mb-3">
        Disclaimer: Generated content may be inaccurate or false.
      </p>
    </div>
  ) : (
    <div className="fixed w-screen h-screen bg-black z-10 bg-opacity-[92%] text-white text-2xl font-semibold flex justify-center items-center text-center">
      WebGPU is not supported
      <br />
      by this browser :&#40;
    </div>
  );
}

export default App;
