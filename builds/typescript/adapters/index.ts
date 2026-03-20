import type { AdapterConfig, Preferences } from "../contracts.js";
import type { ModelAdapter } from "./base.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";

export function createModelAdapter(
  adapterName: string,
  adapterConfig: AdapterConfig,
  preferences: Preferences
): ModelAdapter {
  const legacyBootstrapModel = "llama3.1";
  const preferenceModel = preferences.default_model.trim();
  const useAdapterModel =
    preferenceModel.length === 0 ||
    (preferenceModel === legacyBootstrapModel && adapterConfig.model !== legacyBootstrapModel);

  const resolvedConfig: AdapterConfig = {
    ...adapterConfig,
    model: useAdapterModel ? adapterConfig.model : preferenceModel,
  };

  switch (adapterName) {
    case "openai-compatible":
      return new OpenAICompatibleAdapter(resolvedConfig);
    default:
      throw new Error(`Unsupported provider adapter: ${adapterName}`);
  }
}
