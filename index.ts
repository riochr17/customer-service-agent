require('dotenv').config();
import { AgentTool, OpenAILLM, startAgentWAHA } from "@ssww.one/framework";
import { agentOwner } from "./mode-owner";
import { agentCustomer, whatsapp_escalation } from "./mode-customer";

console.log({
  CHATGPT_APIKEY: process.env.CHATGPT_APIKEY,
  CHATGPT_MODEL: process.env.CHATGPT_MODEL,
  CHATGPT_ENDPOINT: process.env.CHATGPT_ENDPOINT,
  WAHA_CONFIG_BASEURL: process.env.WAHA_CONFIG_BASEURL,
  WAHA_CONFIG_APIKEY: process.env.WAHA_CONFIG_APIKEY,
  WAHA_CALLBACK_PORT: process.env.WAHA_CALLBACK_PORT,
  WHATSAPP_NUMBER_ESCALATION: process.env.WHATSAPP_NUMBER_ESCALATION,
  ESCALATION_RULE: process.env.ESCALATION_RULE,
  NAME: process.env.NAME,
  AGENT_BRIEF: process.env.AGENT_BRIEF,
});

const llm = new OpenAILLM();
export async function agent(at: AgentTool) {
  switch (at.source.type) {
    case "whatsapp-waha":
      if (whatsapp_escalation.phone_number && at.source.from_user?.pn.includes(whatsapp_escalation.phone_number)) {
        await agentOwner(at, llm);
      } else {
        await agentCustomer(at, llm);
      }
      break;
    default:
      at.exit(`Anda terhubung melalui kanal yang tidak didukung, silahkan gunakan whatsapp`);
  }
}

startAgentWAHA(agent, { llm });
