"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type PaymentMethod = "gcash" | "bank_transfer";

interface PaymentSettings {
  gcash_number: string;
  gcash_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
}

interface Props {
  bookingId: string;
  selectedPaymentMethod: PaymentMethod;
  onSuccess?: () => void;
}

export default function PaymentVerificationPage({
  bookingId,
  selectedPaymentMethod: initialMethod,
  onSuccess,
}: Props) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase
        .from("settings")
        .select("key, value");

      if (data) {
        const map = Object.fromEntries(data.map((r: { key: string; value: string }) => [r.key, r.value]));
        setSettings({
          gcash_number: map.gcash_number ?? "",
          gcash_name: map.gcash_name ?? "",
          bank_name: map.bank_name ?? "",
          bank_account_number: map.bank_account_number ?? "",
          bank_account_name: map.bank_account_name ?? "",
        });
      }
    }
    fetchSettings();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, etc.).");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.");
      return;
    }

    setError(null);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please attach your payment receipt.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop();
      const path = `receipts/${bookingId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("payment-receipts")
        .getPublicUrl(path);

      const receiptUrl = urlData.publicUrl;

      const res = await fetch("/api/payment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, paymentMethod, receiptUrl }),
      });

      if (res.status === 429) {
        throw new Error("Too many submissions. Please wait before trying again.");
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to submit receipt.");
      }

      setDone(true);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Receipt Submitted</h2>
          <p className="text-gray-500 text-sm">
            Your payment receipt has been uploaded. Our team will verify it shortly and update your booking status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-pink-600 px-4 py-5">
        <h1 className="text-white text-lg font-semibold">Payment Verification</h1>
        <p className="text-pink-100 text-sm mt-0.5">Submit your proof of payment</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto p-4 space-y-5">
        {/* Payment method selector */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">Payment Method</p>
          <div className="grid grid-cols-2 gap-3">
            {(["gcash", "bank_transfer"] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors ${
                  paymentMethod === method
                    ? "border-pink-600 bg-pink-50 text-pink-600"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {method === "gcash" ? "GCash" : "Bank Transfer"}
              </button>
            ))}
          </div>
        </div>

        {/* Payment instructions */}
        {settings && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-700 mb-3">Send Payment To</p>

            {paymentMethod === "gcash" ? (
              <div className="space-y-2">
                <DetailRow label="GCash Number" value={settings.gcash_number} copyable />
                <DetailRow label="Account Name" value={settings.gcash_name} />
              </div>
            ) : (
              <div className="space-y-2">
                <DetailRow label="Bank" value={settings.bank_name} />
                <DetailRow label="Account Number" value={settings.bank_account_number} copyable />
                <DetailRow label="Account Name" value={settings.bank_account_name} />
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">
              After sending, take a screenshot of the confirmation and upload it below.
            </p>
          </div>
        )}

        {/* Receipt upload */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">Upload Receipt</p>

          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Receipt preview"
                className="w-full rounded-xl object-contain max-h-64 border border-gray-100"
              />
              <button
                type="button"
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow border border-gray-200 text-gray-500 hover:text-gray-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-pink-300 hover:text-pink-400 transition-colors"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm">Tap to attach screenshot</span>
              <span className="text-xs">PNG, JPG up to 5 MB</span>
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={uploading || !file}
          className="w-full bg-pink-600 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "Submitting..." : "Submit Receipt"}
        </button>
      </form>
    </div>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{value}</span>
        {copyable && (
          <button type="button" onClick={copy} className="text-pink-500 hover:text-pink-700">
            {copied ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
