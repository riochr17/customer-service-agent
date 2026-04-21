import { AgentTool, loop, OpenAILLM, WAHATools } from "@ssww.one/framework";
import { SimpleStorage } from "./simple-storage";
import { v4 } from "uuid";
import z from "zod";

export const whatsapp_escalation = {
  phone_number: process.env.WHATSAPP_NUMBER_ESCALATION || ''
};

export const whatsapp_leads_conversion = {
  phone_number: process.env.WHATSAPP_NUMBER_LEADS_CONVERSION || ''
};

export const list_ingore_numbers: string[] = (process.env.INGORE_NUMBERS || '').split(',').map(z => z.trim());

function getTS() {
  return new Date().toLocaleString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
    timeZoneName: 'long'
  });
}

export async function agentCustomer(at: AgentTool, llm: OpenAILLM) {
  let is_escalated = false;
  if (at.source.type == 'whatsapp-waha') {
    await at.addInformation(`Ini adalah percakapan dengan customer melalui whatsapp dengan data user = ${JSON.stringify(at.source.from_user || {})}`)
    await at.addInformation(`[User Message]: ${at.source.initial_message}`);
  }

  const name = process.env.NAME || 'ABC Agent';
  await at.prepareKnowledge(`Your name is ${name}.`);
  await at.prepareKnowledge(process.env.AGENT_BRIEF || 'No brief');
  await at.prepareKnowledge(`Current date and time: ${getTS()}`);
  await at.prepareKnowledge([
    '**Aturan Eskalasi ke Customer Service Manusia (Human Support)**',
    process.env.ESCALATION_RULE || 'Customer dapat melakukan eskalasi kapanpun dalam kondisi apapun',
    'sebelum meneruskan eskalasi konfirmasi lagi ke pelanggan apakah mereka benar-benar ingin melakukan eskalasi',
    'jika pelanggan menjawab tidak, maka tidak perlu ekalasi (false)'
  ].join('\n'));
  await at.prepareKnowledge([
    '**Indikasi konversi leads pelanggan**',
    process.env.LEADS_CONVERSION_RULE || 'Jika pelanggan berpotensi ingin melakukan pemesanan/pembelian, kumpulkan informasi minimal nama (jika sudah ada tidak perlu) dan layanan/barang apa yang ingin dibeli beserta kuantitasnya',
    'Konfirmasi ulang ke pelanggan sebelum mengirimkan pemesanan, nanti di akhir saya akan menanyakan lagi apakah pelanggan sudah yakin dengan pemesanannya pastikan semua informasi sudah terkumpul',
    'jika pelanggan membatalkan pemesanan/pembelian, maka tidak perlu dilanjutkan pemesanannya'
  ].join('\n'));
  await at.prepareKnowledge(`Kamu sebagai agent harus dapat membedakan mana indikasi konversi leads pelanggan dan yang mana eskalasi ke CS human support.`);

  at.print(await at.askLLM(`Berikan sapaan singkat ke customer dan jawab pertanyaannya jika ada dengan singkat`), true);
  await loop(async () => {
    const instruction = await at.waitForUserInstruction();
    if (at.is_last_waha_message_from_me) {
      console.log(`Session has been escalated manually`);
      at.waha_disable_seen_and_typing = true;
      is_escalated = true;
    }
    
    if (is_escalated) {
      return;
    }

    const type = await at.askLLM(`Apakah percakapan user mengarah ke konversi leads (yakin > 80%), eskalasi (yakin > 80%), atau selain keduanya?`, z.enum(['LEADS', 'ESKALASI', 'LAINNYA']));
    await at.addInformation(`Current date and time: ${getTS()}`);
    await at.addInformation(`[User message]: ${instruction}`);
    switch (type) {
      case "LEADS":
        const old_leads_1 = await at.askLLM(`Apakah pelanggan sblmnya sudah berhasil melakukan pemesanan dan kamu sudah menginfokan ke tim laundry?`, z.object({ has_complete_order: z.boolean() }));
        if (old_leads_1.has_complete_order) {
          const old_leads_2 = await at.askLLM(`Apakah ini pemesanan yang sama dengan sebelumnya yang berhasil atau ini pemesanan baru? kalau benar -> true, kalau order baru -> false`, z.object({ is_same_leads: z.boolean() }));
          if (old_leads_2.is_same_leads) {
            console.log(`Leads yang sama`);
            break;
          }
        }
        const leads_conversion_data = await at.askLLM(`Apakah pelanggan ingin melakukan pembelian/pemesanan barang sesuai aturan konversi leads?.`, z.object({ is_leads_conversion: z.boolean()}));
        const leads_conversion_data_confirmed = await at.askLLM(`Apakah pelanggan sudah menyatakan "ya" dan mengonfirmasi bahwa ingin melakukan pemesanan/pembeliannya? Harus ada pernyataan secara explisit "ya" atau yang setara`, z.object({ is_confirmed: z.boolean()}));
        if (leads_conversion_data.is_leads_conversion && leads_conversion_data_confirmed.is_confirmed) {
          if (!whatsapp_leads_conversion.phone_number) {
            at.print(await at.askLLM(`Beritahu customer kalau chatbot ini belum diberikan nomor whatsapp utk mengirimkan pemesanan/pembelian tetapi jangan khawatir krn percakapan ini tetap tersimpan dan nanti akan dilihat pemilik usaha.`), true);
            return;
          } else {
            const summary = await at.askLLM(`Buatkan ringkasan pemesanan yang ingin dilakukan pelanggan`);
            const user = at.source.type === 'whatsapp-waha' ? at.source.from_user : undefined;
            if (user?.pn) {
              const leads_conversion_message = [
                `ADA PELANGGAN MAU PESAN`,
                '',
                `*Pelanggan*`,
                `Nama: ${user.name || '<tanpa nama>'}`,
                `Nomor WA: ${user.pn.split('@')?.[0]}`,
                '',
                `*Ringkasan*`,
                summary
              ].join('\n');
              await WAHATools.sendMessage(`${whatsapp_leads_conversion.phone_number}@c.us`, leads_conversion_message, process.env.WAHA_CONFIG_BASEURL || '', process.env.WAHA_CONFIG_APIKEY || '');
            }
            at.print(await at.askLLM(`Beritahu pelanggan bahwa pemesanan telah dikirimkan ke pemilik usaha.`), true);
            return;
          }
        }
        break;
      case "ESKALASI":
        const escalated_data = await at.askLLM(`Apakah pelanggan ingin mengeskalasi percakapan ke customer service manusia (human support) sesuai aturan eskalasi?.`, z.object({ is_user_want_escalation: z.boolean()}));
        const escalated_data_confirmed = await at.askLLM(`Apakah pelanggan sudah menyatakan "ya" bahwa ingin mengeskalasi ke customer service manusia (human support)? Harus ada pernyataan secara explisit "ya" atau yang setara`, z.object({ is_confirmed: z.boolean()}));
        if (!is_escalated && escalated_data.is_user_want_escalation && escalated_data_confirmed.is_confirmed) {
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
        break;
    }
    await at.streamLLM(
      `Respond user message based on given knowledge and current conversation.`,
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
