"use client"

import * as React from "react"
import { useState, useEffect, useCallback, useMemo, type ChangeEvent } from "react"
import { LiveProvider, LivePreview, LiveError } from "react-live"
import Editor from "@monaco-editor/react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Upload, ImageIcon, Undo2, Redo2, Save, Moon, Sun, X, AlertTriangle, Settings } from "lucide-react"

// Priority: 1. Runtime config, 2. Build-time env var, 3. localhost fallback
const getApiBaseUrl = (): string => {
  // Check for runtime config (can be set via window object)
  if (typeof window !== "undefined" && (window as any).__API_URL__) {
    return (window as any).__API_URL__
  }
  // Check for Vite build-time env var
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  // Fallback to localhost for development
  return "http://localhost:8000"
}

const API_BASE_URL = getApiBaseUrl()
const isLocalhost = API_BASE_URL.includes("localhost")

const reactLiveScope = {
  React,
  useState: React.useState,
  useEffect: React.useEffect,
  useCallback: React.useCallback,
  useMemo: React.useMemo,
  useRef: React.useRef,
  useContext: React.useContext,
  useReducer: React.useReducer,
  createElement: React.createElement,
  Fragment: React.Fragment,
  Component: React.Component,
  createContext: React.createContext,
  forwardRef: React.forwardRef,
  memo: React.memo,
  Children: React.Children,
  cloneElement: React.cloneElement,
  isValidElement: React.isValidElement,
}

function normalizeGeneratedCode(raw: string): string {
  if (!raw) return ""
  let code = raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith("```")) return false
      if (trimmed.startsWith("import ")) return false
      return true
    })
    .join("\n")

  code = code.replace(/export\s+default\s+function\s+GeneratedComponent\s*\(/, "function GeneratedComponent(")
  code = code.replace(/export\s+default\s+/g, "")

  code = code.replace(/(?<!React\.)\buseState\b/g, "React.useState")
  code = code.replace(/(?<!React\.)\buseEffect\b/g, "React.useEffect")
  code = code.replace(/(?<!React\.)\buseCallback\b/g, "React.useCallback")
  code = code.replace(/(?<!React\.)\buseMemo\b/g, "React.useMemo")
  code = code.replace(/(?<!React\.)\buseRef\b/g, "React.useRef")
  code = code.replace(/(?<!React\.)\buseContext\b/g, "React.useContext")
  code = code.replace(/(?<!React\.)\buseReducer\b/g, "React.useReducer")

  return code.trim()
}

type Theme = "dark" | "light"

const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ui-copilot-theme") as Theme) || "dark"
    }
    return "dark"
  })
  const [prompt, setPrompt] = useState(
    "Give me a 3-card responsive grid.\nReturn only valid React component code.\nDo not wrap in fences.\nDefine: export default function GeneratedComponent() { ... }",
  )
  const [generatedCode, setGeneratedCode] = useState<string>("")
  const [editableCode, setEditableCode] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [visionLoading, setVisionLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [showSettings, setShowSettings] = useState(false)
  const [customApiUrl, setCustomApiUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("apiUrl") || ""
    }
    return ""
  })

  useEffect(() => {
    localStorage.setItem("ui-copilot-theme", theme)
  }, [theme])

  useEffect(() => {
    const savedUrl = localStorage.getItem("apiUrl")
    if (savedUrl) {
      ;(window as any).__API_URL__ = savedUrl
    }
  }, [])

  const handleSaveApiUrl = () => {
    if (customApiUrl.trim()) {
      localStorage.setItem("apiUrl", customApiUrl.trim())
      ;(window as any).__API_URL__ = customApiUrl.trim()
      setShowSettings(false)
      window.location.reload() // Reload to apply new URL
    }
  }

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  const commitToHistory = useCallback(
    (code: string) => {
      setHistory((prev) => {
        const base = historyIndex >= 0 && historyIndex < prev.length ? prev.slice(0, historyIndex + 1) : prev
        const next = [...base, code]
        const newIndex = next.length - 1
        setHistoryIndex(newIndex)
        return next
      })
    },
    [historyIndex],
  )

  const handleGenerate = async () => {
    setLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/generate-ui`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })

      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(`Server returned ${res.status}: Expected JSON but got ${contentType || "unknown"}`)
      }

      const data = await res.json()
      if (data.error) {
        console.error("Backend error:", data.error, data.reasons)
        setPreviewError(data.error)
      }
      if (data.code) {
        const code = data.code as string
        setGeneratedCode(code)
        setEditableCode(code)
        commitToHistory(code)
      } else {
        setGeneratedCode("")
        setEditableCode("")
      }
    } catch (err) {
      console.error(err)
      setPreviewError(err instanceof Error ? err.message : "Error calling backend. Check console for details.")
    } finally {
      setLoading(false)
    }
  }

  const handleScreenshotFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setScreenshotFile(file)
  }

  const handleScreenshotGenerate = async () => {
    if (!screenshotFile) {
      setPreviewError("Please upload a screenshot first.")
      return
    }

    const form = new FormData()
    form.append("file", screenshotFile)
    setVisionLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/vision-ui`, {
        method: "POST",
        body: form,
      })

      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(`Server returned ${res.status}: Expected JSON but got ${contentType || "unknown"}`)
      }

      const data = await res.json()
      if (data.code) {
        setGeneratedCode(data.code)
        setEditableCode(data.code)
        commitToHistory(data.code)
      } else {
        setPreviewError("Vision model did not return code.")
      }
    } catch (err) {
      console.error(err)
      setPreviewError(err instanceof Error ? err.message : "Error processing screenshot.")
    } finally {
      setVisionLoading(false)
    }
  }

  const handleUndo = useCallback(() => {
    setHistoryIndex((idx) => {
      if (idx <= 0) return idx
      const newIdx = idx - 1
      setEditableCode(history[newIdx])
      return newIdx
    })
  }, [history])

  const handleRedo = useCallback(() => {
    setHistoryIndex((idx) => {
      if (idx < 0 || idx >= history.length - 1) return idx
      const newIdx = idx + 1
      setEditableCode(history[newIdx])
      return newIdx
    })
  }, [history])

  const handleCommitSnapshot = useCallback(() => {
    if (!editableCode.trim()) return
    commitToHistory(editableCode)
  }, [editableCode, commitToHistory])

  const previewCode = useMemo(() => {
    if (!editableCode.trim()) return ""
    const cleaned = normalizeGeneratedCode(editableCode)
    return `${cleaned}\nrender(<GeneratedComponent />);`.trim()
  }, [editableCode])

  const isAnyLoading = loading || visionLoading

  return (
    <div
      className={`min-h-screen transition-colors duration-500 ${
        theme === "dark"
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-slate-900"
      }`}
    >
      {/* Animated background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 100, 0], y: [0, -50, 0] }}
          transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          className={`absolute -top-40 -left-40 w-80 h-80 rounded-full blur-3xl ${
            theme === "dark" ? "bg-indigo-500/10" : "bg-indigo-500/20"
          }`}
        />
        <motion.div
          animate={{ x: [0, -80, 0], y: [0, 60, 0] }}
          transition={{ duration: 25, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          className={`absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl ${
            theme === "dark" ? "bg-purple-500/10" : "bg-purple-500/15"
          }`}
        />
      </div>

      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`border-b ${
          theme === "dark" ? "border-slate-800/50" : "border-gray-200"
        } p-4 flex justify-between items-center backdrop-blur-xl bg-opacity-80 relative z-10`}
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          >
            <Sparkles className="w-6 h-6 text-indigo-500" />
          </motion.div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            AI UI Copilot
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isLocalhost && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Using localhost API</span>
            </motion.div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSettings(true)}
            className={`p-2 rounded-lg ${
              theme === "dark" ? "bg-slate-800 hover:bg-slate-700" : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            <Settings className="w-5 h-5" />
          </motion.button>
          {/* Theme toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTheme}
            className={`p-2 rounded-lg ${
              theme === "dark" ? "bg-slate-800 hover:bg-slate-700" : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            <motion.div initial={false} animate={{ rotate: theme === "dark" ? 0 : 180 }} transition={{ duration: 0.3 }}>
              {theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </motion.div>
          </motion.button>
        </div>
      </motion.header>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md p-6 rounded-2xl ${theme === "dark" ? "bg-slate-900" : "bg-white"} shadow-2xl`}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">API Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-slate-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Backend API URL</label>
                  <input
                    type="url"
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    placeholder="https://your-backend-api.com"
                    className={`w-full px-4 py-2 rounded-lg border ${
                      theme === "dark"
                        ? "bg-slate-800 border-slate-700 focus:border-indigo-500"
                        : "bg-gray-100 border-gray-300 focus:border-indigo-500"
                    } outline-none transition-colors`}
                  />
                  <p className="mt-2 text-xs text-slate-400">Current: {API_BASE_URL}</p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveApiUrl}
                  disabled={!customApiUrl.trim()}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium disabled:opacity-50"
                >
                  Save and Reload
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Main Content */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          {/* Left Panel */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-5"
          >
            {/* Prompt Input */}
            <div
              className={`rounded-2xl p-1 ${
                theme === "dark"
                  ? "bg-gradient-to-br from-indigo-500/20 to-purple-500/20"
                  : "bg-gradient-to-br from-indigo-500/10 to-purple-500/10"
              }`}
            >
              <textarea
                className={`w-full h-36 rounded-xl p-4 text-sm outline-none resize-none transition-colors ${
                  theme === "dark"
                    ? "bg-slate-900 border-0 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/50"
                    : "bg-white border-0 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/50"
                }`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the UI you want to generate..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={loading}
                className="group relative px-5 py-2.5 rounded-xl font-medium text-sm text-white overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 transition-all group-hover:from-indigo-500 group-hover:to-purple-500" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-400 blur-xl" />
                </div>
                <span className="relative flex items-center gap-2">
                  {loading ? <X className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {loading ? "Generating..." : "Generate from Prompt"}
                </span>
              </motion.button>

              <label
                className={`group cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  theme === "dark"
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    : "bg-gray-200 hover:bg-gray-300 text-slate-700"
                }`}
              >
                <Upload className="w-4 h-4 group-hover:scale-110 transition-transform" />
                {screenshotFile ? "Change Screenshot" : "Upload Screenshot"}
                <input type="file" accept="image/*" onChange={handleScreenshotFileChange} className="hidden" />
              </label>

              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleScreenshotGenerate}
                disabled={!screenshotFile || visionLoading}
                className="group relative px-5 py-2.5 rounded-xl font-medium text-sm text-white overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600 transition-all group-hover:from-emerald-500 group-hover:to-teal-500" />
                <span className="relative flex items-center gap-2">
                  {visionLoading ? <X className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  {visionLoading ? "Processing..." : "Generate from Screenshot"}
                </span>
              </motion.button>
            </div>

            {/* Generated Code (read-only) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`rounded-2xl overflow-hidden ${theme === "dark" ? "bg-slate-900/80" : "bg-white/80"} backdrop-blur-sm`}
            >
              <div
                className={`flex items-center gap-2 px-4 py-3 border-b ${theme === "dark" ? "border-slate-800" : "border-gray-200"}`}
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold">Generated Code</h2>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${theme === "dark" ? "bg-slate-800 text-slate-400" : "bg-gray-200 text-slate-500"}`}
                >
                  read-only
                </span>
              </div>
              <pre
                className={`p-4 text-xs overflow-auto max-h-40 ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}
              >
                {generatedCode || "// Click Generate to see code"}
              </pre>
            </motion.div>

            {/* Inline Editor */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`rounded-2xl overflow-hidden ${theme === "dark" ? "bg-slate-900/80" : "bg-white/80"} backdrop-blur-sm`}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b ${theme === "dark" ? "border-slate-800" : "border-gray-200"}`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold">Inline Editor</h2>
                </div>
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className={`p-2 rounded-lg transition-all disabled:opacity-30 ${theme === "dark" ? "bg-slate-800 hover:bg-slate-700" : "bg-gray-200 hover:bg-gray-300"}`}
                  >
                    <Undo2 className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRedo}
                    disabled={historyIndex < 0 || historyIndex >= history.length - 1}
                    className={`p-2 rounded-lg transition-all disabled:opacity-30 ${theme === "dark" ? "bg-slate-800 hover:bg-slate-700" : "bg-gray-200 hover:bg-gray-300"}`}
                  >
                    <Redo2 className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCommitSnapshot}
                    disabled={!editableCode.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-medium disabled:opacity-30"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </motion.button>
                </div>
              </div>
              <div className="h-64">
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  theme={theme === "dark" ? "vs-dark" : "light"}
                  value={editableCode}
                  onChange={(value) => setEditableCode(value ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16 },
                    lineNumbers: "on",
                    renderLineHighlight: "all",
                    bracketPairColorization: { enabled: true },
                  }}
                />
              </div>
            </motion.div>
          </motion.div>

          {/* Right Panel - Live Preview */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`rounded-2xl overflow-hidden flex flex-col ${theme === "dark" ? "bg-slate-900/80" : "bg-white/80"} backdrop-blur-sm`}
          >
            <div
              className={`flex items-center gap-2 px-4 py-3 border-b ${theme === "dark" ? "border-slate-800" : "border-gray-200"}`}
            >
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Live Preview</h2>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              {/* Error Toast */}
              <AnimatePresence>
                {previewError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className={`mb-4 p-4 rounded-xl flex items-start gap-3 ${
                      theme === "dark"
                        ? "bg-red-500/10 border border-red-500/20 text-red-300"
                        : "bg-red-50 border border-red-200 text-red-600"
                    }`}
                  >
                    <AlertTriangle
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${theme === "dark" ? "text-red-400" : "text-red-500"}`}
                    />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${theme === "dark" ? "text-red-300" : "text-red-600"}`}>
                        Error
                      </p>
                      <p className={`text-xs mt-1 ${theme === "dark" ? "text-red-400/80" : "text-red-600"}`}>
                        {previewError}
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setPreviewError(null)}
                      className={`p-1 rounded-lg transition-colors ${theme === "dark" ? "hover:bg-red-500/20 text-red-400" : "hover:bg-red-100 text-red-500"}`}
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {isAnyLoading && !previewCode ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                    className="p-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  >
                    <Sparkles className="w-6 h-6 text-white" />
                  </motion.div>
                  <motion.p
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                    className={`text-sm ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`}
                  >
                    Generating preview...
                  </motion.p>
                </div>
              ) : previewCode ? (
                <LiveProvider code={previewCode} noInline scope={reactLiveScope}>
                  <div className={`rounded-xl p-4 min-h-[300px] ${theme === "dark" ? "bg-slate-950" : "bg-gray-50"}`}>
                    <LivePreview />
                  </div>
                  <AnimatePresence>
                    <LiveError
                      className={`mt-4 p-4 rounded-xl text-sm flex items-start gap-3 ${
                        theme === "dark"
                          ? "bg-red-500/10 border border-red-500/20 text-red-300"
                          : "bg-red-50 border border-red-200 text-red-600"
                      }`}
                    />
                  </AnimatePresence>
                </LiveProvider>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
                  <div className={`p-4 rounded-full ${theme === "dark" ? "bg-slate-800" : "bg-gray-200"}`}>
                    <ImageIcon className={`w-8 h-8 ${theme === "dark" ? "text-slate-600" : "text-gray-400"}`} />
                  </div>
                  <p className={`text-sm text-center ${theme === "dark" ? "text-slate-500" : "text-gray-500"}`}>
                    Generate something or upload a screenshot
                    <br />
                    to see the live preview
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  )
}

export default App
