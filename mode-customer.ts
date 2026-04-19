import { AgentTool, loop, OpenAILLM, WAHATools } from "@ssww.one/framework";
import { SimpleStorage } from "./simple-storage";
import { v4 } from "uuid";
import z from "zod";

export const whatsapp_escalation = {
  phone_number: process.env.WHATSAPP_NUMBER_ESCALATION || ''
};

export async function agentCustomer(at: AgentTool, llm: OpenAILLM) {
  let is_escalated = false;
  if (at.source.type == 'whatsapp-waha') {
    await at.addInformation(`Ini adalah percakapan dengan customer melalui whatsapp dengan data user = ${JSON.stringify(at.source.from_user || {})}`)
    await at.addInformation(`[User Message]: ${at.source.initial_message}`);
  }

  const name = process.env.NAME || 'ABC Agent';
  await at.prepareKnowledge(`Your name is ${name}.`);
  await at.prepareKnowledge(process.env.AGENT_BRIEF || 'No brief');
  await at.prepareKnowledge(`Current date and time: ${new Date().toISOString()}`);
  await at.prepareKnowledge([
    '**Aturan Eskalasi ke Customer Service Manusia (Human Support)**',
    process.env.ESCALATION_RULE || 'Customer dapat melakukan eskalasi kapanpun dalam kondisi apapun',
    'sebelum meneruskan eskalasi konfirmasi lagi ke pelanggan apakah mereka benar-benar ingin melakukan eskalasi',
    'jika pelanggan menjawab tidak, maka tidak perlu ekalasi (false)'
  ].join('\n'));

  at.print(await at.askLLM(`Berikan sapaan singkat ke customer dan jawab pertanyaannya jika ada dengan singkat`), true);
  await loop(async () => {
    const instruction = await at.waitForUserInstruction();
    
    if (is_escalated) {
      return;
    }

    await at.prepareKnowledge(`Current date and time: ${new Date().toISOString()}`);
    const escalated_data = await at.askLLM(`Apakah pelanggan ingin mengeskalasi percakapan ke customer service manusia (human support) sesuai aturan eskalasi dan telah mengkonfirmasi ingin eskalasi?`, z.object({ is_user_want_escalation: z.boolean()}));
    if (!is_escalated && escalated_data.is_user_want_escalation) {
      if (!whatsapp_escalation.phone_number) {
        at.print(await at.askLLM(`Beritahu customer kalau chatbot ini belum diberikan nomor whatsapp utk melakukan eskalasi.`), true);
        return;
      } else {
        const summary = await at.askLLM(`Buatkan ringkasan dari percakapan ini maksimal 2 paragraf`);
        const user = at.source.type === 'whatsapp-waha' ? at.source.from_user : undefined;
        if (user?.pn) {
          const escalation_message = [
            `Ada yang ingin melakukan eskalasi percakapan`,
            '',
            `*Pelanggan*`,
            `Nama: ${user.name || '<tanpa nama>'}`,
            `Nomor WA: ${user.pn.split('@')?.[0]}`,
            '',
            `*Ringkasan*`,
            summary
          ].join('\n');
          await WAHATools.sendMessage(`${whatsapp_escalation.phone_number}@c.us`, escalation_message, process.env.WAHA_CONFIG_BASEURL || '', process.env.WAHA_CONFIG_APIKEY || '');
        }
        at.print(await at.askLLM(`Beritahu pelanggan bahwa customer service manusia akan menangani percakapan setelah ini, mohon menunggu hingga customer service manusia membalas.`), true);
        is_escalated = true;
        at.waha_disable_seen_and_typing = true;
        return;
      }
    }
    await at.streamLLM(
      `User request: "${instruction}". Respond user request based on given knowledge.`,
      (s: string) => at.print(s)
    );
    at.print('', true);
  });
  const summary = await at.askLLM(`Buatkan ringkasan dari percakapan ini maksimal 2 paragraf`);
  const vector = await llm.vectorize(summary, 'openai/text-embedding-3-small');
  if (at.source.type == 'whatsapp-waha') {
    await SimpleStorage.storeWhatsAppHistory({
      type: 'whatsapp',
      history: at.llm.history,
      summary,
      vector,
      id: at.source.from_user?.pn || v4(),
      date_iso: new Date().toISOString()
    });
  }
}
