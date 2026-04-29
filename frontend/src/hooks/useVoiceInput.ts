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
  clearTranscript: () => void
}

export function useVoiceInput(): UseVoiceInputReturn {
  const SpeechRecognitionCtor = getSpeechRecognition()
  const isSupported = SpeechRecognitionCtor !== null

  const [state, setState] = useState<VoiceInputState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  // continuous モードで蓄積されるテキストを ref で保持（stale closure を避けるため）
  const accumulatedRef = useRef('')

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
    recognition.continuous = true   // ポーズで自動停止しない
    recognition.interimResults = false

    accumulatedRef.current = ''

    recognition.onresult = (ev: SpeechRecognitionEvent) => {
      // 確定済み結果をすべて結合（continuous モードで複数フレーズを蓄積）
      let text = ''
      for (let i = 0; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          text += ev.results[i][0].transcript
        }
      }
      accumulatedRef.current = text
    }

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      setError(ev.error || '音声認識エラーが発生しました')
      setState('error')
    }

    recognition.onend = () => {
      // stop() 呼び出し後にのみ transcript を確定させる
      const finalText = accumulatedRef.current
      accumulatedRef.current = ''
      if (finalText) {
        setTranscript(finalText)
      }
      setState('idle')
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

  const clearTranscript = useCallback(() => setTranscript(''), [])

  return { isSupported, state, transcript, startRecording, stopRecording, error, reset, clearTranscript }
}
