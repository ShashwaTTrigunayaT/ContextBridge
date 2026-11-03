import './src/env.js';
import { createApp } from './src/api.js';
import { llmEnabled, llmModel } from './src/llm.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`ContextBridge running at http://localhost:${port}`);
  console.log(
    `Install accounts: admin@contextbridge.local (administrator) / reviewer@contextbridge.local (reviewer) / incoming@contextbridge.local (incoming member) — password "${process.env.INSTALL_PASSWORD || 'contextbridge'}"`,
  );
  console.log(
    llmEnabled()
      ? `Assistant: Groq (${llmModel()}) — answers still grounded in the approved handover`
      : 'Assistant: deterministic retrieval (no GROQ_API_KEY found, so no model call is made)',
  );
});
