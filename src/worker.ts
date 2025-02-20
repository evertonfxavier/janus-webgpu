/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AutoProcessor,
  MultiModalityCausalLM,
  BaseStreamer,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "@huggingface/transformers";

interface Navigator {
  gpu?: any;
}

interface Message {
  content: string;
  image?: string;
}

const IMAGE_GENERATION_COMMAND_PREFIX = "/imagine ";
const MAX_NEW_TEXT_TOKENS = 1024;

/**
 * Helper function to perform WebGPU feature detection
 */
let fp16_supported = false;

async function check(): Promise<void> {
  try {
    const adapter = await (navigator as Navigator).gpu?.requestAdapter();

    if (!adapter) {
      throw new Error("WebGPU is not supported (no adapter found)");
    }

    fp16_supported = adapter.features.has("shader-f16");

    self.postMessage({
      status: "success",
      data: fp16_supported,
    });
  } catch (e) {
    self.postMessage({
      status: "error",
      data: (e as Error).toString(),
    });
  }
}

/**
 * This class uses the Singleton pattern to enable lazy-loading of the pipeline
 */
class ImageGenerationPipeline {
  private static model_id = "onnx-community/Janus-1.3B-ONNX";
  private static processor?: AutoProcessor;
  private static model?: MultiModalityCausalLM;

  static async getInstance(
    progress_callback?: (progress: any) => void
  ): Promise<[AutoProcessor, MultiModalityCausalLM]> {
    this.processor ??= await AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    });

    this.model ??= (await MultiModalityCausalLM.from_pretrained(this.model_id, {
      dtype: fp16_supported
        ? {
            prepare_inputs_embeds: "q4",
            language_model: "q4f16",
            lm_head: "fp16",
            gen_head: "fp16",
            gen_img_embeds: "fp16",
            image_decode: "fp32",
          }
        : {
            prepare_inputs_embeds: "fp32",
            language_model: "q4",
            lm_head: "fp32",
            gen_head: "fp32",
            gen_img_embeds: "fp32",
            image_decode: "fp32",
          },
      device: {
        prepare_inputs_embeds: "wasm",
        language_model: "webgpu",
        lm_head: "webgpu",
        gen_head: "webgpu",
        gen_img_embeds: "webgpu",
        image_decode: "webgpu",
      },
      progress_callback,
    })) as MultiModalityCausalLM;

    return [this.processor, this.model];
  }
}

class ProgressStreamer extends BaseStreamer {
  private total: number;
  private on_progress: (progress: any) => void;
  private count: number | null = null;
  private start_time: number | null = null;

  constructor(total: number, on_progress: (progress: any) => void) {
    super();
    this.total = total;
    this.on_progress = on_progress;
  }

  put(): void {
    if (this.count === null) {
      this.count = 0;
      this.start_time = performance.now();
      return;
    }

    const progress = ++this.count / this.total;

    this.on_progress({
      count: this.count,
      total: this.total,
      progress,
      time: performance.now() - (this.start_time ?? 0),
    });
  }

  end(): void {}
}

const stopping_criteria = new InterruptableStoppingCriteria();

async function generate(messages: Message[]): Promise<void> {
  const message = messages.at(-1);
  if (!message) return;

  self.postMessage({ status: "start" });

  const [processor, model] = await ImageGenerationPipeline.getInstance();
  console.log({ processor });

  if (message.content.startsWith(IMAGE_GENERATION_COMMAND_PREFIX)) {
    const text = message.content.replace(IMAGE_GENERATION_COMMAND_PREFIX, "");
    const conversation = [{ role: "User", content: text }];
    const inputs = await processor(conversation, {
      chat_template: "text_to_image",
    });

    const callback_function = (output: any) => {
      self.postMessage({ status: "image-update", ...output });
    };

    const num_image_tokens = processor.num_image_tokens;
    const streamer = new ProgressStreamer(num_image_tokens, callback_function);

    const outputs = await model.generate_images({
      ...inputs,
      min_new_tokens: num_image_tokens,
      max_new_tokens: num_image_tokens,
      do_sample: true,
      streamer,
    });

    const blob = await outputs[0].toBlob();
    self.postMessage({ status: "image-update", blob });
  } else {
    const inputs = await processor(
      message.image
        ? [
            {
              role: "User",
              content: `<image_placeholder>\n${message.content}`,
              images: [message.image],
            },
          ]
        : [
            {
              role: "System",
              content: "You are a helpful assistant. Answer concisely.",
            },
            { role: "User", content: message.content },
          ]
    );

    let startTime: number | undefined;
    let numTokens = 0;
    let tps: number | undefined;
    const token_callback_function = () => {
      startTime ??= performance.now();
      if (numTokens++ > 0) {
        tps = (numTokens / (performance.now() - startTime)) * 1000;
      }
    };

    const callback_function = (output: any) => {
      self.postMessage({ status: "text-update", output, tps, numTokens });
    };

    const streamer = new TextStreamer(processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function,
      token_callback_function,
    });

    await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TEXT_TOKENS,
      do_sample: false,
      streamer,
      stopping_criteria,
    });
  }
  self.postMessage({ status: "complete" });
}

async function load(): Promise<void> {
  self.postMessage({ status: "loading", data: "Loading model..." });
  await ImageGenerationPipeline.getInstance((x) => self.postMessage(x));
  self.postMessage({ status: "ready" });
}

self.addEventListener("message", async (e) => {
  const { type, data } = e.data;
  switch (type) {
    case "check":
      check();
      break;
    case "load":
      load();
      break;
    case "generate":
      stopping_criteria.reset();
      generate(data);
      break;
    case "interrupt":
      stopping_criteria.interrupt();
      break;
    case "reset":
      stopping_criteria.reset();
      break;
  }
});
