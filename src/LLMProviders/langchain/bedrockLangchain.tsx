/* eslint-disable no-debugger */
import debug from "debug";
import React from "react";
import { SettingItem, useGlobal } from "../refs";
import LangchainBase from "./base";
import { ModelsHandler } from "../utils";

import { OpenAIChatInput } from "@langchain/openai";

import { ChatBedrockConverse } from "@langchain/aws";

import LLMProviderInterface, { LLMConfig } from "../interface";
import { IconExternalLink } from "@tabler/icons-react";

const logger = debug("textgenerator:BedrockProvider");

export default class LangchainBedrockProvider
  extends LangchainBase
  implements LLMProviderInterface
{
  static provider = "Langchain" as const;
  static id = "Bedrock (Langchain)" as const;
  static slug = "bedrockChat" as const;
  static displayName = "Bedrock Chat";

  /** generate candidates in parallel instead of sending the variable n */
  legacyN = false;

  /** You can change the default headers here */
  defaultHeaders?: Record<string, string | null>;

  llmClass: any;

  llmPredict = false;
  streamable = true;

  provider = LangchainBedrockProvider.provider;
  id = LangchainBedrockProvider.id;
  originalId = LangchainBedrockProvider.id;

  default_values: any = {};

  getConfig(options: LLMConfig) {
    return this.cleanConfig({
      // openAIApiKey: options.api_key,

      // ------------Necessary stuff--------------
      modelKwargs: options.modelKwargs,
      modelName: options.model,
      maxTokens: +options.max_tokens,
      temperature: +options.temperature,
      frequencyPenalty: +options.frequency_penalty || 0,
      presencePenalty: +options.presence_penalty || 0,
      n: options.n || 1,
      stop: options.stop || undefined,
      streaming: options.stream || false,
      maxRetries: 3,
    } as Partial<OpenAIChatInput>);
  }

  async load() {
    this.llmClass = ChatBedrockConverse;
  }

  async getLLM(_options: LLMConfig): Promise<any> {
    const options = {
      ..._options,
      model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    };

    const llm = new (this.llmClass as typeof ChatBedrockConverse)({
      model: options.model,
      region: "us-east-1",
    });
    //this.getConfig(options),

    // @ts-ignore
    llm.clientOptions ??= {};
    // @ts-ignore
    llm.clientOptions.fetch = Fetch;

    return llm;
  }

  RenderSettings(props: Parameters<LLMProviderInterface["RenderSettings"]>[0]) {
    const global = useGlobal();

    const id = props.self.id;

    return (
      <>
        <ModelsHandler
          register={props.register}
          sectionId={props.sectionId}
          llmProviderId={props.self.originalId || id}
          default_values={{}}
        />

        <div className="plug-tg-flex plug-tg-flex-col plug-tg-gap-2">
          <div className="plug-tg-text-lg plug-tg-opacity-70">Useful links</div>
          <a href="https://aws.amazon.com">
            <SettingItem
              name="Create account AWS"
              className="plug-tg-text-xs plug-tg-opacity-50 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
          <a href="https://aws.amazon.com">
            <SettingItem
              name="Create a profile"
              className="plug-tg-text-xs plug-tg-opacity-50 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
          <a href="https://docs.mistral.ai/api">
            <SettingItem
              name="API documentation"
              className="plug-tg-text-xs plug-tg-opacity-50 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
        </div>
      </>
    );
  }
}
