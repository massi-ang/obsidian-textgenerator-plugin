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
import { Message, Role } from "#/types";
import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { AwsCredentialsWrapper } from "./awsCredentialsWrapper";
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
  custom_body: "{{modelId}}",
  sanatization_response: "",
  sanatization_streaming: "",
  streamable: true,
};

export type CustomConfig = Record<keyof typeof default_values, string>;

export default class BedrockProvider
  extends CustomProvider
  implements LLMProviderInterface
{
  static provider = "Custom";
  static id = "Bedrock (Custom)" as const;
  static slug = "bedrock" as const;
  static displayName = "Bedrock";

  streamable = true;

  provider = BedrockProvider.provider;
  id = BedrockProvider.id;
  originalId = BedrockProvider.id;
  default_values = default_values;

  async generate(
    messages: Message[],
    reqParams: Partial<Omit<LLMConfig, "n">>,
    onToken?: (token: string, first: boolean) => void,
    customConfig?: CustomConfig
  ): Promise<string> {
    return new Promise(async (s, r) => {
      try {
        console.log("generate", reqParams);
        logger("----");
        console.log("messages", messages);
        console.log("customConfig", customConfig);

        let first = true;
        let allText = "";

        const config = (this.plugin.settings.LLMProviderOptions[this.id] ??=
          {});
        logger("config", config);
        console.log(config);
        const credentials =
          await new AwsCredentialsWrapper().getAWSCredentialIdentity(
            "obsidian-bedrock"
          );
        const client = new BedrockRuntimeClient({
          region: config.region,
          credentials,
        });

        if (!Platform.isDesktop) {
          s("");
          return;
        }
        const stream = reqParams.stream && this.streamable && config.streamable;
        const roleMap = function (role: Role): ConversationRole {
          if (role == "user" || role == "human") return ConversationRole.USER;
          if (role == "assistant" || role == "admin")
            return ConversationRole.ASSISTANT;
          throw new Error(`Unsupported role: ${role}`);
        };
        if (!stream) {
          const resp = await client.send(
            new ConverseCommand({
              modelId: config.modelId,
              messages: messages.map((m) => ({
                role: roleMap(m.role),
                content: [
                  {
                    text: typeof m.content == "string" ? m.content : "",
                  },
                ],
              })),
            })
          );
          console.log(resp);

          s(resp.output?.message?.content![0].text ?? "");

          return;
        } else {
          const resp = await client.send(
            new ConverseStreamCommand({
              modelId: config.modelId,
              messages: messages.map((m) => ({
                role: roleMap(m.role),
                content: [
                  {
                    text: typeof m.content == "string" ? m.content : "",
                  },
                ],
              })),
            })
          );
          console.log(resp);
          if (resp.stream) {
            for await (const token of resp.stream) {
              const tokenText = token.contentBlockDelta?.delta?.text ?? "";
              await onToken?.(tokenText, first);
              allText += tokenText;
              first = false;
            }

            s(allText);
          } else {
            throw new Error("Stream not supported");
          }
        }
      } catch (errorRequest: any) {
        logger("generate error", errorRequest);
        return r(errorRequest);
      }
    });
  }

  async generateMultiple(
    messages: Message[],
    reqParams: Partial<LLMConfig>,
    customConfig?: CustomConfig
  ): Promise<string[]> {
    try {
      console.log("generateMultiple", reqParams);
      const config = (this.plugin.settings.LLMProviderOptions[this.id] ??= {});
      logger("config", config);
      console.log("config", config);
      console.log("Custom Config", customConfig);
      const credentials =
        await new AwsCredentialsWrapper().getAWSCredentialIdentity(
          "obsidian-bedrock"
        );
      const client = new BedrockRuntimeClient({
        region: config.region,
        credentials,
      });

      if (!Platform.isDesktop) {
        return [""];
      }
      //const stream = reqParams.stream && this.streamable && config.streamable;
      const roleMap = function (role: Role): ConversationRole {
        if (role == "user" || role == "human") return ConversationRole.USER;
        if (role == "assistant" || role == "admin")
          return ConversationRole.ASSISTANT;
        throw new Error(`Unsupported role: ${role}`);
      };
      let i = 0;
      const suggestions = [];
      const message =
        typeof messages[0].content == "string"
          ? messages[0].content.trim()
          : "";
      console.log("message", message);
      while (i++ < (reqParams.n ?? 1)) {
        const resp = await client.send(
          new ConverseCommand({
            modelId: config.modelId,
            messages: [
              {
                role: "user",
                content: [
                  {
                    text: message,
                  },
                ],
              },
            ],
            system: [{ text: "Complete the user sentence" }],
            inferenceConfig: {
              stopSequences: [...(reqParams.stop ?? []), ":"],
            },
          })
        );
        console.log(resp);
        if (resp.output?.message?.content![0]?.text)
          suggestions.push(resp.output?.message?.content![0]?.text);
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

        <div className="plug-tg-flex plug-tg-flex-col plug-tg-gap-2">
          <div className="plug-tg-text-lg plug-tg-opacity-70">Useful links</div>
          <a href="https://docs.anthropic.com/claude/reference/getting-started-with-the-api">
            <SettingItem
              name="Getting started"
              className="plug-tg-text-xs plug-tg-opacity-50 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
          <a href="https://docs.anthropic.com/claude/reference/selecting-a-model">
            <SettingItem
              name="Available models"
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
