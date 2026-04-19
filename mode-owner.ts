import { AgentTool, loop, OpenAILLM, startAgentCLI } from "@ssww.one/framework";
import z from "zod";
import { SimpleStorage } from "./simple-storage";

export async function agentOwner(at: AgentTool, llm: OpenAILLM) {
  let initial_message = at.source.type === 'telegram' || at.source.type === 'whatsapp-waha' ? at.source.initial_message : undefined;
  await loop(async () => {
    const instruction = initial_message || await at.waitForUserInstruction();
    initial_message = undefined;
    await at.addInformation(`[User Message]: ${instruction}`);
    const mode = await at.askLLM([
      `Klasifikasikan user message menjadi salah satu jenis LIST_LOG_BY_KEYWORD, READ_SPECIFIC_LOG, OTHERS`,
      'User bisa meminta pencarian file log berdasarkan keyword apapun (LIST_LOG_BY_KEYWORD) atau jika user ingin membaca file log secara spesifik (READ_SPECIFIC_LOG) maka user harus memberitahu nama file log yang ingin dibaca',
      'Jika tidak disebutkan secara explisit maka artinya klasifikasi yang terjadi adalah OTHERS'
    ].join('\n'), z.enum(['LIST_LOG_BY_KEYWORD', 'READ_SPECIFIC_LOG', 'OTHERS']));
    switch (mode) {
      case 'LIST_LOG_BY_KEYWORD':
        const keyword = await at.askLLM(`Apa keyword dari pencarian files yang diminta user?`, z.object({ keyword: z.string() }));
        const vector = await llm.vectorize(keyword.keyword, 'openai/text-embedding-3-small');
        console.log({keyword});
        console.log(vector);
        const list_filename_by_keyword = await SimpleStorage.searchRelatedData(vector, 5);
        if (list_filename_by_keyword.length === 0) {
          at.print(await at.askLLM(`Beritahu user kalau tidak ada data terkait hal yang diminta`), true);
        } else {
          at.print(await at.askLLM(`Berikut daftar files yang ditemukan di database sesuai permintaan user: ${list_filename_by_keyword.join(',')}, beritahukan user mengenai file ini gunakan list dengan angka 1, 2, 3...`), true);
        }
        break;
      case "READ_SPECIFIC_LOG":
        const filename = await at.askLLM(`Apa nama file spesific yang ingin dibuka oleh user?`, z.object({ filename: z.string() }));
        const content = await SimpleStorage.getSpecificLog(filename.filename);
        at.print(await at.askLLM([
          `Berikut ini konten file yang diminta user:`,
          '```',
          content,
          '```',
          '',
          'Beritahu user tentang content file ini'
        ].join('\n')), true);
        break;
      case "OTHERS":
        at.print(await at.askLLM(`Jawab user berdasarkan user message terakhir`), true);
    }
  });
}
