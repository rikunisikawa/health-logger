import { useEffect } from 'react'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

const pulseKeyframes = `
@keyframes voicePulse {
  0%   { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
  70%  { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
  100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
}
`

export default function VoiceInputButton({ onTranscript, disabled, size = 'md' }: Props) {
  const { isSupported, state, transcript, startRecording, stopRecording, clearTranscript } = useVoiceInput()

  useEffect(() => {
    if (transcript) {
      onTranscript(transcript)
      clearTranscript() // 消費後にクリアして再レンダリングループを防ぐ
    }
  }, [transcript, onTranscript, clearTranscript])

  if (!isSupported) return null

  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'
  const sm = size === 'sm'

  if (isRecording) {
    return (
      <>
        <style>{pulseKeyframes}</style>
        <button
          type="button"
          onClick={stopRecording}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: sm ? '2px 8px' : '4px 12px',
            borderRadius: '999px',
            border: '2px solid #dc3545',
            backgroundColor: '#dc3545',
            color: '#fff',
            fontSize: sm ? '0.72rem' : '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            animation: 'voicePulse 1.2s ease-in-out infinite',
            whiteSpace: 'nowrap',
          }}
          aria-label="録音停止"
          aria-pressed={true}
        >
          <span style={{ fontSize: sm ? '0.8rem' : '0.95rem' }}>⏹</span>
          停止
        </button>
      </>
    )
  }

  if (isProcessing) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: sm ? '2px 8px' : '4px 12px',
          fontSize: sm ? '0.72rem' : '0.82rem',
          color: '#6c757d',
          flexShrink: 0,
        }}
      >
        <span
          className="spinner-border"
          role="status"
          style={{ width: '0.9em', height: '0.9em', borderWidth: '0.15em' }}
        />
        処理中
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: sm ? '2px 8px' : '4px 12px',
        borderRadius: '999px',
        border: '2px solid #6c757d',
        backgroundColor: 'transparent',
        color: '#6c757d',
        fontSize: sm ? '0.72rem' : '0.82rem',
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: 'background-color 0.2s, color 0.2s',
      }}
      aria-label="音声入力"
      aria-pressed={false}
    >
      <span style={{ fontSize: sm ? '0.8rem' : '0.95rem' }}>🎤</span>
      音声入力
    </button>
  )
}
