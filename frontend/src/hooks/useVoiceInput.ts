import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API の型宣言（@types/dom-speech-recognition がない環境向け）
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  if (typeof w['SpeechRecognition'] === 'function') {
    return w['SpeechRecognition'] as SpeechRecognitionConstructor
  }
  if (typeof w['webkitSpeechRecognition'] === 'function') {
    return w['webkitSpeechRecognition'] as SpeechRecognitionConstructor
  }
  return null
}

export type VoiceInputState = 'idle' | 'recording' | 'processing' | 'error'

export interface UseVoiceInputReturn {
  isSupported: boolean
  state: VoiceInputState
  transcript: string
  startRecording: () => void
  stopRecording: () => void
  error: string | null
  reset: () => void
}

export function useVoiceInput(): UseVoiceInputReturn {
  const SpeechRecognitionCtor = getSpeechRecognition()
  const isSupported = SpeechRecognitionCtor !== null

  const [state, setState] = useState<VoiceInputState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
    }
  }, [])

  const startRecording = useCallback(() => {
    if (!SpeechRecognitionCtor) return
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (ev: SpeechRecognitionEvent) => {
      const result = ev.results[ev.results.length - 1]
      if (result) {
        const text = result[0].transcript
        setTranscript(text)
      }
      setState('idle')
    }

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      setError(ev.error || '音声認識エラーが発生しました')
      setState('error')
    }

    recognition.onend = () => {
      setState((prev) => (prev === 'recording' ? 'processing' : prev))
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      setState('recording')
      setError(null)
      setTranscript('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '音声認識を開始できませんでした')
      setState('error')
    }
  }, [SpeechRecognitionCtor])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      setState('processing')
      recognitionRef.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setState('idle')
    setTranscript('')
    setError(null)
  }, [])

  return { isSupported, state, transcript, startRecording, stopRecording, error, reset }
}
