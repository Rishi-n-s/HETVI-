// ==========================================================
// supabase.js — Supabase Storage Client & Upload Engine
// ==========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ==========================================================
// 1. Supabase Project Configuration
// NOTE: Replace these with your Supabase Project URL & Anon Key
// if using your own custom Supabase project.
// ==========================================================
export const SUPABASE_CONFIG = {
    url: "https://pmptvxwtjcyntacnywgk.supabase.co", // Replace with your Supabase Project URL
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcHR2eHd0amN5bnRhY255d2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMTczMDEsImV4cCI6MjEwMjU5MzMwMX0.GNdzFxdJMBZuYzRPKLYFI6NFRQMPNFdOmCgYqYDkuVo", // Replace with your Supabase Anon Public Key
    bucketName: "chat-media" // Name of your Public Storage Bucket in Supabase
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB Limit
export const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/svg+xml",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/aac",
    "audio/m4a",
    "audio/x-m4a"
];

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

/**
 * Upload a media file (Image, Video, or Audio) to Supabase Storage with real-time progress tracking
 * @param {File} file - The file (image, video, or audio) to upload
 * @param {Function} onProgress - Callback function receiving progress percentage (0 to 100)
 * @returns {Promise<{publicUrl: string, fileName: string, fileSize: number, mediaType: string}>}
 */
export async function uploadMediaToSupabase(file, onProgress) {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("No file selected for upload."));
        }

        // Validate File Size
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return reject(new Error(`File exceeds the 50MB size limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`));
        }

        // Validate MIME Type
        const fileType = (file.type || "").toLowerCase();
        const isAllowed = ALLOWED_MIME_TYPES.some(t => fileType.startsWith(t.split("/")[0]) || fileType === t);
        if (!isAllowed) {
            return reject(new Error(`Unsupported file type: ${file.type || 'Unknown'}. Please select an image, video, or audio file.`));
        }

        const isVideo = file.type.startsWith("video");
        const isAudio = file.type.startsWith("audio");
        const mediaType = isVideo ? "video" : isAudio ? "audio" : "image";
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const filePath = `${mediaType}s/${Date.now()}_${cleanFileName}`;

        // Direct REST endpoint for Supabase Storage with XMLHttpRequest for exact byte progress tracking
        const uploadEndpoint = `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.bucketName}/${filePath}`;

        const xhr = new XMLHttpRequest();
        console.log("Upload Endpoint:", uploadEndpoint);
        xhr.open("POST", uploadEndpoint, true);

        // Required Supabase Headers
        const cleanContentType = (file.type || "application/octet-stream").split(";")[0].trim();
        xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_CONFIG.anonKey}`);
        xhr.setRequestHeader("apikey", SUPABASE_CONFIG.anonKey);
        xhr.setRequestHeader("Content-Type", cleanContentType);
        xhr.setRequestHeader("x-upsert", "true");

        // Real-time Progress Tracking (0 to 100%)
        if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
                    onProgress(percent);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // Upload complete
                if (onProgress) onProgress(100);

                // Construct Supabase Public URL
                const publicUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/public/${SUPABASE_CONFIG.bucketName}/${filePath}`;

                console.log("[Supabase Storage] Upload Success! Public URL:", publicUrl);

                resolve({
                    publicUrl: publicUrl,
                    fileName: file.name,
                    fileSize: file.size,
                    mediaType: mediaType
                });
            } else {
                let errorDetail = "Failed to upload to Supabase Storage.";
                try {
                    const response = JSON.parse(xhr.responseText);
                    errorDetail = response.message || response.error || errorDetail;
                } catch (e) {
                    errorDetail = xhr.statusText || errorDetail;
                }
                console.error("[Supabase Storage Error]:", xhr.status, errorDetail);
                reject(new Error(`Supabase upload error (${xhr.status}): ${errorDetail}`));
            }
        };

        xhr.onerror = () => {
            console.error("[Supabase Storage Network Error]");
            reject(new Error("Network error occurred while uploading to Supabase Storage."));
        };

        // Send binary data
        xhr.send(file);
    });
}

/**
 * Delete a media file from Supabase Storage by its public URL
 * @param {string} mediaUrl - The full public URL of the uploaded file
 * @returns {Promise<boolean>}
 */
export async function deleteMediaFromSupabase(mediaUrl) {
    if (!mediaUrl || typeof mediaUrl !== "string") return false;

    try {
        const bucket = SUPABASE_CONFIG.bucketName;
        let relativePath = "";

        // Patterns:
        // 1. /storage/v1/object/public/chat-media/<filePath>
        // 2. /chat-media/<filePath>
        const standardPrefix = `/storage/v1/object/public/${bucket}/`;
        if (mediaUrl.includes(standardPrefix)) {
            relativePath = mediaUrl.split(standardPrefix)[1];
        } else if (mediaUrl.includes(`/${bucket}/`)) {
            relativePath = mediaUrl.split(`/${bucket}/`)[1];
        } else {
            // Try extracting path after last URL domain segment
            const urlObj = new URL(mediaUrl);
            const pathParts = urlObj.pathname.split(`/${bucket}/`);
            if (pathParts.length > 1) {
                relativePath = pathParts[1];
            }
        }

        if (!relativePath) {
            console.warn("[Supabase Storage] Could not parse file path from URL:", mediaUrl);
            return false;
        }

        // Clean query parameters if present
        relativePath = decodeURIComponent(relativePath.split("?")[0]);
        console.log(`[Supabase Storage] Deleting file '${relativePath}' from bucket '${bucket}'...`);

        const { data, error } = await supabase.storage.from(bucket).remove([relativePath]);

        if (error) {
            console.error("[Supabase Storage Delete Error]:", error);
            return false;
        }

        console.log("[Supabase Storage Delete Success]:", data);
        return true;
    } catch (err) {
        console.warn("[Supabase Storage Delete Exception]:", err);
        return false;
    }
}

