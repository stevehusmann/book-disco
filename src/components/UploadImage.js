import React, { useState } from 'react';
import { getSupabaseClient } from '../supabaseClient';

const UploadImage = ({ onUploaded }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');

  const uploadSelectedImage = async () => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Choose an image file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError('');
    setUploadMessage('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
      const filePath = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${safeName || 'image'}`;
      const { data, error } = await getSupabaseClient()
        .storage
        .from('images')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (error) throw error;

      const uploadedPath = data?.path || filePath;
      const { data: urlData } = getSupabaseClient()
        .storage
        .from('images')
        .getPublicUrl(uploadedPath);
      if (!urlData?.publicUrl) throw new Error('Supabase did not return a public image URL.');

      onUploaded({ path: uploadedPath, src: urlData.publicUrl });
      setFile(null);
      setUploadMessage('Image uploaded and selected.');
    } catch (error) {
      console.error('Could not upload spine image:', error);
      setUploadError(error?.message || 'Could not upload image.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mb-2">
      <label className="form-label mb-1" htmlFor="spine-image-upload">Upload image to Supabase</label>
      <div className="input-group input-group-sm">
        <input
          id="spine-image-upload"
          className="form-control"
          type="file"
          accept="image/*"
          aria-label="Image file to upload"
          disabled={isUploading}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setUploadError('');
            setUploadMessage('');
          }}
        />
        <button
          className="btn btn-outline-primary"
          type="button"
          disabled={!file || isUploading}
          onClick={uploadSelectedImage}
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {uploadError && <div className="small text-danger mt-1" role="alert">{uploadError}</div>}
      {uploadMessage && <div className="small text-success mt-1" role="status">{uploadMessage}</div>}
    </div>
  );
};

export default UploadImage;
