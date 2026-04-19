import fs from 'fs';
import _ from 'lodash';
import moment from 'moment';
import path from 'path';
import { SimTools } from './similarity';

export namespace SimpleStorage {
  const folder_path = path.resolve('./storage');
  async function createFolderIfNotExist() {
    if (!fs.existsSync(folder_path)) {
      await fs.promises.mkdir(folder_path);
    }
  }

  let cached_items: SimTools.DatasetItem[] = [];

  function cleanPhoneNumberID(_pn: string) {
    const pn = _pn.replace(/\D/g, '');
    if (pn.startsWith('+62')) {
      return pn.slice(1);
    }
    if (pn.startsWith('0')) {
      return `62${pn.slice(1)}`;
    }
    return pn;
  }

  export interface ItemStorageData {
    type: 'telegram' | 'whatsapp'
    history: any[]
    summary: string
    vector: number[]
    id: string
    date_iso: string
  }

  export async function storeWhatsAppHistory(data: ItemStorageData) {
    await createFolderIfNotExist();
    const filename = _.snakeCase(`wa_${cleanPhoneNumberID(data.id)}-${moment(data.date_iso).format('YYYY-MM-DD-HH-mm-ss')}.json`);
    const filepath = path.resolve(folder_path, filename);
    await fs.promises.writeFile(filepath, JSON.stringify(data, null, 2));
    cached_items.push({ id: filepath, vector: data.vector });
  }

  export async function getSpecificLog(log_filename: string): Promise<string> {
    await createFolderIfNotExist();
    const filepath = path.resolve(folder_path, log_filename);
    if (!fs.existsSync(filepath)) {
      return `File ${log_filename} doesnt exist`;
    }
    const content = await fs.promises.readFile(filepath, 'utf-8');
    const data: ItemStorageData = JSON.parse(content);
    return data.summary;
  }

  export async function searchRelatedData(vector: number[], limit: number = 5): Promise<string[]> {
    await createFolderIfNotExist();
    const top_k_data = SimTools.topKSimilar(vector, cached_items, limit);
    return await Promise.all(top_k_data.map(async item => await fs.promises.readFile(item.id, 'utf-8')));
  }
}
