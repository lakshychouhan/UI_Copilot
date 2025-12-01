"use client";

import React, {
  useMemo,
  useState,
  useCallback,
  type ChangeEvent,
} from "react";
import { LiveProvider, LivePreview, LiveError } from "react-live";
import Editor from "@monaco-editor/react";
import * as ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun,
  Moon,
  Upload,
  Wand2,
  Loader2,
  AlertCircle,
  Code2,
  Eye,
} from "lucide-react";

// -------------------- React Live scope --------------------
// This is CRITICAL in production: React must be in scope
const reactScope = {
  React,
  ReactDOM,
  motion,
};

// -------------------- Helpers --------------------

const DEFAULT_SNIPPET = `() => (
  <div className="flex items-center justify-center min-h-[200px] bg-slate-100 text-slate-900">
    <p className="text-sm text-slate-600">Generated UI will appear here</p>
  </div>
)`;

/**
 * Normalize the raw code from the model into something react-live can execute.
 * - Strip ``` fences
 * - Remove "export default function GeneratedComponent() { ... }" if present
 * - Ensure final result is *an expression* (typically a component arrow function)
 */
function normalizeGeneratedCode(raw: string): string {
  if (!raw) return DEFAULT_SNIPPET;

  let code = raw.trim();

  // 1. Keep only first fenced block if present
  const fenceMatch = code.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    code = fenceMatch[1].trim();
  }

  // 2. Remove "export default" if present – react-live doesn’t need module syntax
  code = code.replace(
    /export\s+default\s+function\s+GeneratedComponent\s*\(/,
    "function GeneratedComponent("
  );

  // 3. If we still have a plain component declaration, transform it into an expression
  //    that react-live can use as the last expression.
  //
  //    Example:
  //    function GeneratedComponent() { return (<div/>); }
  //    =>
  //    (() => <GeneratedComponent />)
  if (/function\s+GeneratedComponent\s*\(/.test(code)) {
    code = `${code}

(() => <GeneratedComponent />)
    `.trim();
    return code;
  }

  // 4. If the model returned plain JSX (like "<div>...</div>"),
  //    wrap it into an arrow function expression.
  if (!code.startsWith("(") && !code.startsWith("() =>") && code.includes("<")) {
    code = `() => (
${code}
)`;
  }

  return code || DEFAULT_SNIPPET;
}

/**
 * Crude "contrast fix" so we avoid completely invisible text.
 * - In light mode: avoid text-white
 * - In dark mode: avoid text-black
 */
function applyThemeContrastFix(code: string, isDark: boolean): string {
  if (!code) return code;
  if (isDark) {
    return code.replace(/text-black/g, "text-slate-50");
  } else {
    return code.replace(/text-white/g, "text-slate-900");
  }
}

// -------------------- Main App --------------------

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const [isDark, setIsDark] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );
  const [generatedCode, setGeneratedCode] = useState(DEFAULT_SNIPPET);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("preview");

  // Normalize + theme adjust for react-live
  const previewCode = useMemo(() => {
    const normalized = normalizeGeneratedCode(generatedCode);
    return applyThemeContrastFix(normalized, isDark);
  }, [generatedCode, isDark]);

  const handleToggleTheme = () => setIsDark((prev) => !prev);

  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScreenshotFile(file);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append("prompt", prompt || "");
      if (screenshotFile) {
        formData.append("screenshot", screenshotFile);
      }

      const res = await fetch(`${API_BASE_URL}/generate-ui`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error("Backend error:", await res.text());
        throw new Error("Backend error while generating UI");
      }

      const data = await res.json();
      // expecting { code: string }
      const rawCode: string = data.code ?? "";
      setGeneratedCode(rawCode || DEFAULT_SNIPPET);
      setActiveTab("preview");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate UI");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, screenshotFile]);

  return (
    <div
      className={`min-h-screen transition-colors ${
        isDark ? "bg-slate-950 text-slate-50" : "bg-slate-50 text-slate-900"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
              <SparklesMini />
            </div>
            <div>
              <h1 className="font-semibold tracking-tight">UI Copilot</h1>
              <p className="text-xs text-slate-400">
                Describe your UI, get live React code + preview
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleTheme}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-slate-600/40 bg-slate-900/40 hover:bg-slate-800/60"
          >
            {isDark ? (
              <>
                <Sun className="h-3 w-3" />
                Light
              </>
            ) : (
              <>
                <Moon className="h-3 w-3" />
                Dark
              </>
            )}
          </button>
        </header>

        {/* Layout */}
        <div className="grid md:grid-cols-2 gap-4 items-stretch">
          {/* Left: controls */}
          <section className="space-y-3">
            <div
              className={`rounded-2xl border p-3 text-sm ${
                isDark
                  ? "border-slate-800 bg-slate-900/60"
                  : "border-slate-200 bg-white"
              }`}
            >
              <label className="block text-xs font-medium mb-1">
                Describe your UI
              </label>
              <textarea
                value={prompt}
                onChange={handlePromptChange}
                rows={5}
                placeholder="Example: A card with product image, price, and 'Add to cart' button..."
                className={`w-full resize-none rounded-xl border px-3 py-2 text-xs outline-none ${
                  isDark
                    ? "bg-slate-950/60 border-slate-800 focus:border-indigo-500"
                    : "bg-slate-50 border-slate-200 focus:border-indigo-500"
                }`}
              />
            </div>

            <div
              className={`rounded-2xl border p-3 text-sm flex flex-col gap-2 ${
                isDark
                  ? "border-slate-800 bg-slate-900/60"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Screenshot (optional)</span>
                <label className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border cursor-pointer hover:opacity-90 transition">
                  <Upload className="h-3 w-3" />
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {screenshotPreview && (
                <div className="relative mt-1">
                  <img
                    src={screenshotPreview}
                    alt="Screenshot preview"
                    className="w-full rounded-xl border border-slate-700/40 object-cover max-h-40"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-medium shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating UI...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate UI
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-xl px-3 py-2">
                <AlertCircle className="h-4 w-4 mt-px" />
                <p>{error}</p>
              </div>
            )}
          </section>

          {/* Right: code + preview */}
          <section
            className={`rounded-2xl border flex flex-col ${
              isDark
                ? "border-slate-800 bg-slate-900/70"
                : "border-slate-200 bg-white"
            }`}
          >
            {/* Tabs */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-slate-700/40 text-xs">
              <div className="inline-flex items-center rounded-full bg-slate-800/40 p-1">
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full transition ${
                    activeTab === "preview"
                      ? "bg-slate-900 text-slate-50"
                      : "text-slate-400"
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </button>
                <button
                  onClick={() => setActiveTab("code")}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full transition ${
                    activeTab === "code"
                      ? "bg-slate-900 text-slate-50"
                      : "text-slate-400"
                  }`}
                >
                  <Code2 className="h-3 w-3" />
                  Code
                </button>
              </div>

              <span className="text-[10px] text-slate-500">
                React + Tailwind live playground
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-[320px]">
              <AnimatePresence mode="wait">
                {activeTab === "preview" ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className={`h-full`}
                  >
                    <LiveProvider
                      code={previewCode}
                      scope={reactScope}
                      noInline
                    >
                      <div
                        className={`rounded-xl p-4 min-h-[300px] ${
                          isDark
                            ? "bg-slate-950 text-slate-50"
                            : "bg-slate-50 text-slate-900"
                        }`}
                      >
                        <LivePreview />
                      </div>
                      <LiveError
                        className="mt-2 text-[11px] text-red-400 px-3 pb-2"
                      />
                    </LiveProvider>
                  </motion.div>
                ) : (
                  <motion.div
                    key="code"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <Editor
                      height="320px"
                      defaultLanguage="tsx"
                      theme={isDark ? "vs-dark" : "light"}
                      value={generatedCode}
                      onChange={(value) => setGeneratedCode(value || "")}
                      options={{
                        fontSize: 12,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Tiny sparkles icon (so we don't pull another lib)
function SparklesMini() {
  return (
    <svg
      className="h-4 w-4 text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2l1.3 3.8L17 7.3l-3.7 1.5L12 13l-1.3-4.2L7 7.3l3.7-1.5L12 2zM6 14l.7 2 1.8.7-1.8.7L6 19.5l-.7-2.1L3.5 16l1.8-.7L6 14zm12 0l.7 2 1.8.7-1.8.7L18 19.5l-.7-2.1L15.5 16l1.8-.7L18 14z"
        fill="currentColor"
      />
    </svg>
  );
}

export default App;
