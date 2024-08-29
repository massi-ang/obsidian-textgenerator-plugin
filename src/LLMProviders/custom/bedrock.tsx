import React, { useEffect, useMemo } from "react";
import debug from "debug";
import LLMProviderInterface, { LLMConfig } from "../interface";
import useGlobal from "#/ui/context/global";
import { getHBValues } from "#/utils/barhandles";
import SettingItem from "#/ui/settings/components/item";
import Input from "#/ui/settings/components/input";
import CustomProvider, { default_values as baseDefaultValues } from "./base";
import { IconExternalLink } from "@tabler/icons-react";
import { Platform } from "obsidian";
import { Message, Model, Role } from "#/types";
import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromModelId, ChatMessage } from "@mirai73/bedrock-fm";
import { AwsCredentialsWrapper } from "./awsCredentialsWrapper";
import { ModelsHandler } from "../utils";
const logger = debug("textgenerator:BedrockProvider");

const globalVars: Record<string, boolean> = {
  n: true,
  temperature: true,
  timeout: true,
  stream: true,
  messages: true,
  max_tokens: true,
  stop: true,
};

const untangableVars = [
  "custom_header",
  "custom_body",
  "sanatization_response",
  "streamable",
  "CORSBypass",
];

export const default_values = {
  ...baseDefaultValues,
  region: "us-west-2",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  custom_header: "",
  custom_body: "",
  sanatization_response: "",
  sanatization_streaming: "",
  streamable: true,
};

export type CustomConfig = Record<keyof typeof default_values, string>;

const roleMap = function (role: Role): "human" | "ai" | "system" {
  if (role == "user" || role == "human") return "human";
  if (role == "assistant" || role == "admin") return "ai";
  if (role == "system") return "system";
  throw new Error(`Unsupported role: ${role}`);
};

export default class BedrockProvider
  extends CustomProvider
  implements LLMProviderInterface
{
  static provider = "Custom";
  static id = "Bedrock (Custom)" as const;
  static slug = "bedrock" as const;
  static displayName = "Bedrock";
  models: Model[] = [];

  streamable = true;

  provider = BedrockProvider.provider;
  id = BedrockProvider.id;
  originalId = BedrockProvider.id;
  default_values = default_values;

  convertMessage(m: Message): ChatMessage {
    logger(m.role);
    logger(m.content);
    if (typeof m.content == "string") {
      return { role: roleMap(m.role), message: m.content };
    }
    const text: string[] = [];
    const images: string[] = [];
    const content = m.content.forEach((c) => {
      if (c.type == "text") {
        text.push(c.text);
      } else if (c.type == "image_url") {
        if (!c.image_url?.url || !(c.image_url.url.indexOf("base64") >= 0))
          return;
        images.push(c.image_url.url);
      }
    });
    return {
      role: roleMap(m.role),
      message: text.join("\n"),
      images,
    };
  }

  async generate(
    messages: Message[],
    reqParams: Partial<Omit<LLMConfig, "n">>,
    onToken?: (token: string, first: boolean) => void,
    customConfig?: CustomConfig
  ): Promise<string> {
    try {
      logger("generate", reqParams);
      logger("messages", messages);
      logger("customConfig", customConfig);

      let first = true;
      let allText = "";

      const config = (this.plugin.settings.LLMProviderOptions[this.id] ??= {});
      logger("config", config);
      const credentials =
        await new AwsCredentialsWrapper().getAWSCredentialIdentity(
          "obsidian-bedrock"
        );
      const client = new BedrockRuntimeClient({
        region: config.region,
        credentials,
      });
      const fm = fromModelId(config.model, {
        client,
        maxTokenCount: reqParams.max_tokens,
        stopSequences: reqParams.stop ?? [],
        temperature: reqParams.temperature,
      });

      if (!Platform.isDesktop) {
        return "";
      }
      const stream = reqParams.stream && this.streamable && config.streamable;
      const converse_messages = messages.map((m) => this.convertMessage(m));
      logger("messages conv", converse_messages);
      if (!stream) {
        const resp = await fm.chat(converse_messages);
        logger(resp);
        return resp.message;
      } else {
        const resp = await fm.chatStream(converse_messages);
        if (resp) {
          for await (const token of resp) {
            await onToken?.(token, first);
            allText += token;
            first = false;
          }
          logger(allText);
          return allText;
        } else {
          throw new Error("Stream not supported");
        }
      }
    } catch (errorRequest: any) {
      logger("generate error", errorRequest);
      throw new Error(errorRequest);
    }
  }

  async generateMultiple(
    messages: Message[],
    reqParams: Partial<LLMConfig>,
    customConfig?: CustomConfig
  ): Promise<string[]> {
    try {
      logger("generateMultiple", reqParams);
      const config = (this.plugin.settings.LLMProviderOptions[this.id] ??= {});
      logger("config", config);
      logger("Custom Config", customConfig);
      const credentials =
        await new AwsCredentialsWrapper().getAWSCredentialIdentity(
          "obsidian-bedrock"
        );
      const client = new BedrockRuntimeClient({
        region: config.region,
        credentials,
      });
      const fm = fromModelId(config.model, {
        client,
        maxTokenCount: reqParams.max_tokens,
        stopSequences: reqParams.stop ?? [],
        temperature: reqParams.temperature,
      });
      if (!Platform.isDesktop) {
        return [""];
      }
      //const stream = reqParams.stream && this.streamable && config.streamable;

      let i = 0;
      const converse_messages = messages.map((m) => this.convertMessage(m));
      logger(converse_messages);
      const suggestions = [];
      logger("message", messages);
      while (i++ < (reqParams.n ?? 1)) {
        const resp = await fm.chat(converse_messages, {
          stopSequences: [...(reqParams.stop ?? []), ":"],
        });
        if (resp.message) suggestions.push(resp.message);
      }

      return suggestions;
    } catch (errorRequest: any) {
      logger("generateMultiple error", errorRequest);
      throw new Error(errorRequest);
    }
  }

  RenderSettings(props: Parameters<LLMProviderInterface["RenderSettings"]>[0]) {
    const global = useGlobal();

    const config = (global.plugin.settings.LLMProviderOptions[
      props.self.id || "default"
    ] ??= {
      ...default_values,
    });

    const vars = useMemo(() => {
      return getHBValues(
        `${config?.custom_header} 
        ${config?.custom_body}`
      ).filter((d) => !globalVars[d]);
    }, [global.trg]);

    useEffect(() => {
      untangableVars.forEach((v) => {
        config[v] = default_values[v as keyof typeof default_values];
      });
      global.triggerReload();
      global.plugin.saveSettings();
    }, []);

    return (
      <>
        <SettingItem
          name="Region"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            value={config.region || default_values.region}
            placeholder="Enter the AWS Region"
            type="text"
            setValue={async (value) => {
              config.region = value;
              global.triggerReload();
              // TODO: it could use a debounce here
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>
        <ModelsHandler
          register={props.register}
          sectionId={props.sectionId}
          llmProviderId={props.self.originalId}
          default_values={default_values}
        />
        {vars.map((v: string) => (
          <SettingItem
            key={v}
            name={v}
            register={props.register}
            sectionId={props.sectionId}
          >
            <Input
              value={config[v]}
              placeholder={`Enter your ${v}`}
              type={v.toLowerCase().contains("key") ? "password" : "text"}
              setValue={async (value) => {
                config[v] = value;
                global.triggerReload();
                if (v.toLowerCase().contains("key"))
                  global.plugin.encryptAllKeys();
                // TODO: it could use a debounce here
                await global.plugin.saveSettings();
              }}
            />
          </SettingItem>
        ))}

        <div className="plug-tg-flex plug-tg-flex-col plug-tg-gap-1">
          <div className="plug-tg-flex plug-tg-items-center plug-tg-gap-1">
            To use this provider you need to create an AWS profile for the CLI
            called <pre>obsidian-bedrock</pre>.
          </div>
          <div className="plug-tg-text-lg plug-tg-opacity-70">Useful links</div>
          <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html">
            <SettingItem
              name="AWS CLI configuration"
              className="plug-tg-text-s plug-tg-opacity-70 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
          <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html">
            <SettingItem
              name="What is Amazon Bedrock?"
              className="plug-tg-text-s plug-tg-opacity-70 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
          <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html">
            <SettingItem
              name="Available models"
              className="plug-tg-text-s plug-tg-opacity-70 hover:plug-tg-opacity-100"
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
