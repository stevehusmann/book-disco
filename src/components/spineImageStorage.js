import { getSupabaseClient } from '../supabaseClient';

const BUCKET_NAME = 'images';
const IMAGE_FILE_EXTENSION = /\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i;
const STORAGE_PAGE_SIZE = 1000;

export const listSpineImages = async () => {
  const bucket = getSupabaseClient().storage.from(BUCKET_NAME);
  const pendingFolders = [''];
  const images = [];

  while (pendingFolders.length) {
    const folder = pendingFolders.pop();
    let offset = 0;
    let page;

    do {
      const { data, error } = await bucket.list(folder, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error) throw error;

      page = data || [];
      page.forEach((entry) => {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.id == null) {
          pendingFolders.push(path);
          return;
        }

        const mimeType = entry.metadata?.mimetype || '';
        if (!mimeType.startsWith('image/') && !IMAGE_FILE_EXTENSION.test(entry.name)) return;
        const { data: urlData } = bucket.getPublicUrl(path);
        images.push({ name: entry.name, path, src: urlData.publicUrl });
      });
      offset += page.length;
    } while (page.length === STORAGE_PAGE_SIZE);
  }

  return images.sort((left, right) => left.path.localeCompare(right.path));
};
