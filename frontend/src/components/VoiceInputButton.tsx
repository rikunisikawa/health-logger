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
  const { isSupported, state, transcript, startRecording, stopRecording } = useVoiceInput()

  useEffect(() => {
    if (transcript) {
      onTranscript(transcript)
    }
  }, [transcript, onTranscript])

  if (!isSupported) return null

  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'

  const btnSize = size === 'sm' ? 28 : 36
  const fontSize = size === 'sm' ? '0.9rem' : '1.1rem'

  const handleClick = () => {
    if (disabled || isProcessing) return
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <>
      <style>{pulseKeyframes}</style>
      <button
        type="button"
        title={isRecording ? '録音停止' : '音声入力'}
        onClick={handleClick}
        disabled={disabled || isProcessing}
        style={{
          width: btnSize,
          height: btnSize,
          borderRadius: '50%',
          border: 'none',
          cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
          backgroundColor: isRecording ? '#dc3545' : '#6c757d',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          padding: 0,
          flexShrink: 0,
          animation: isRecording ? 'voicePulse 1.2s ease-in-out infinite' : 'none',
          opacity: disabled || isProcessing ? 0.6 : 1,
          transition: 'background-color 0.2s',
        }}
        aria-label={isRecording ? '録音停止' : '音声入力'}
        aria-pressed={isRecording}
      >
        {isProcessing ? (
          <span
            className="spinner-border"
            role="status"
            style={{ width: '1em', height: '1em', borderWidth: '0.15em' }}
          />
        ) : (
          <span role="img" aria-hidden="true">🎤</span>
        )}
      </button>
    </>
  )
}
