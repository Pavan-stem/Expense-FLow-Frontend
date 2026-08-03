const BACKEND_URL = ((import.meta as any).env?.VITE_BACKEND_URL as string) || "http://localhost:5000";


export interface S3UploadResult {
  fileKey: string;
  uploadUrl: string;
  bucket: string;
}

/**
 * Check if AWS S3 is configured on the backend
 */
export async function checkS3Status(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/s3/status`);
    const data = await res.json();
    return Boolean(data.configured);
  } catch (error) {
    console.error("Failed to check S3 status:", error);
    return false;
  }
}

/**
 * Helper to upload a File or Blob directly to S3 via pre-signed URL
 */
export async function uploadFileToS3(file: File): Promise<{ fileKey: string; downloadUrl?: string }> {
  // Step 1: Request pre-signed upload URL from backend
  const res = await fetch(`${BACKEND_URL}/api/s3/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to obtain S3 upload URL");
  }

  const { uploadUrl, fileKey }: S3UploadResult = await res.json();

  // Step 2: Upload file directly to S3 using PUT request
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 direct upload failed with status ${uploadRes.status}`);
  }

  return { fileKey };
}

/**
 * Get a temporary view/download URL for an S3 file key
 */
export async function getS3DownloadUrl(fileKey: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/s3/download-url?fileKey=${encodeURIComponent(fileKey)}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch S3 download URL");
  }
  const data = await res.json();
  return data.downloadUrl;
}
