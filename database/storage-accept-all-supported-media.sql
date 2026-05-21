-- Experience Hub accepts images, audio, video, PDFs, documents, text exports,
-- and future multimodal assets. Keep the bucket private and let the app/backend
-- classify formats instead of blocking valid user files at Storage level.
UPDATE storage.buckets
SET
  public = false,
  allowed_mime_types = NULL
WHERE id = 'experience-media';
