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

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

/**
 * Upload a media file (Image or Video) to Supabase Storage with real-time progress tracking
 * @param {File} file - The file (image or video) to upload
 * @param {Function} onProgress - Callback function receiving progress percentage (0 to 100)
 * @returns {Promise<{publicUrl: string, fileName: string, fileSize: number, mediaType: string}>}
 */
export async function uploadMediaToSupabase(file, onProgress) {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("No file selected for upload."));
        }

        const isVideo = file.type.startsWith("video");
        const mediaType = isVideo ? "video" : "image";
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const filePath = `${mediaType}s/${Date.now()}_${cleanFileName}`;

        // Direct REST endpoint for Supabase Storage with XMLHttpRequest for exact byte progress tracking
        const uploadEndpoint = `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.bucketName}/${filePath}`;

        const xhr = new XMLHttpRequest();
        console.log("Upload Endpoint:", uploadEndpoint);
        xhr.open("POST", uploadEndpoint, true);

        // Required Supabase Headers
        xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_CONFIG.anonKey}`);
        xhr.setRequestHeader("apikey", SUPABASE_CONFIG.anonKey);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
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
