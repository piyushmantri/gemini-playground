import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Content, Part } from '@google/generative-ai'
import { GoogleGenAI } from '@google/genai'
import './App.css'

type Role = 'user' | 'model'
type ModelTab = 'image' | 'video'

type MessagePart =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; mimeType: string; data: string; alt?: string }
  | {
      id: string
      type: 'video'
      mimeType: string
      objectUrl: string
      uri: string
      alt?: string
      metadata: {
        resolution: string
        aspectRatio: string
        durationSeconds?: number
      }
    }

type Message = {
  id: string
  role: Role
  parts: MessagePart[]
  createdAt: number
}

const IMAGE_MODEL_ID = 'models/gemini-3-pro-image-preview'
const VIDEO_MODEL_ID = 'veo-3.1-generate-001'
const STORAGE_KEY = 'geminiChatApiKey'
const VIDEO_POLL_INTERVAL = 8000
const MAX_VIDEO_POLLS = 45
const MIN_VIDEO_DURATION = 5
const MAX_VIDEO_DURATION = 8
const MAX_IMAGE_REFERENCES = 3
const TEXTAREA_LINES = 3

const createId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const safeGetStoredKey = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return ''
    }
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch (error) {
    console.error('Unable to read stored API key', error)
    return ''
  }
}

const releaseVideoResources = (messages: Message[]) => {
  messages.forEach((message) => {
    message.parts.forEach((part) => {
      if (part.type === 'video') {
        URL.revokeObjectURL(part.objectUrl)
      }
    })
  })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type ReferenceImageState = {
  base64: string
  dataUrl: string
  mimeType: string
  name: string
}

const readImageFile = (file: File) =>
  new Promise<{ base64: string; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unsupported file reader result'))
        return
      }
      const commaIndex = result.indexOf(',')
      if (commaIndex === -1) {
        reject(new Error('Invalid data URL'))
        return
      }
      resolve({ base64: result.slice(commaIndex + 1), dataUrl: result })
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })

function App() {
  const [apiKey, setApiKey] = useState<string>(() => safeGetStoredKey())
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(() => !safeGetStoredKey())
  const [activeTab, setActiveTab] = useState<ModelTab>('image')

  const [imageMessages, setImageMessages] = useState<Message[]>([])
  const [imageInput, setImageInput] = useState('')
  const [isImageLoading, setIsImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageReferenceImages, setImageReferenceImages] = useState<ReferenceImageState[]>([])
  const [imageAttachmentError, setImageAttachmentError] = useState<string | null>(null)

  const [videoMessages, setVideoMessages] = useState<Message[]>([])
  const [videoPrompt, setVideoPrompt] = useState('')
  const [isVideoGenerating, setIsVideoGenerating] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [videoStatus, setVideoStatus] = useState<string | null>(null)
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9')
  const [videoResolution, setVideoResolution] = useState('720p')
  const [videoDuration, setVideoDuration] = useState(6)
  const [videoReferenceImage, setVideoReferenceImage] = useState<ReferenceImageState | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const videoMessagesRef = useRef<Message[]>([])

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return
      }
      if (apiKey) {
        window.localStorage.setItem(STORAGE_KEY, apiKey)
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch (storageError) {
      console.error('Unable to persist API key', storageError)
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) {
      setIsApiKeyModalOpen(true)
    }
  }, [apiKey])

  useEffect(() => {
    videoMessagesRef.current = videoMessages
  }, [videoMessages])

  useEffect(() => {
    return () => {
      releaseVideoResources(videoMessagesRef.current)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [imageMessages, videoMessages, isImageLoading, isVideoGenerating, activeTab])

  const isImageFormDisabled = useMemo(() => !apiKey || isImageLoading, [apiKey, isImageLoading])
  const isVideoFormDisabled = useMemo(() => !apiKey || isVideoGenerating, [apiKey, isVideoGenerating])

  const handleTabChange = (nextTab: ModelTab) => {
    setActiveTab(nextTab)
    if (nextTab === 'image') {
      setVideoError(null)
      setVideoStatus(null)
    } else {
      setImageError(null)
      setImageAttachmentError(null)
    }
  }

  const handleImageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmed = imageInput.trim()
    if (!trimmed || isImageLoading) {
      return
    }

    if (!apiKey) {
      setIsApiKeyModalOpen(true)
      return
    }

    const referenceParts = imageReferenceImages.map((image) => ({
      id: createId(),
      type: 'image' as const,
      mimeType: image.mimeType,
      data: image.base64,
      alt: `Reference image: ${image.name}`,
    }))

    const inlineReferenceParts: Part[] = imageReferenceImages.map((image) => ({
      inlineData: {
        data: image.base64,
        mimeType: image.mimeType,
      },
    }))

    const userParts: MessagePart[] = [{ id: createId(), type: 'text', text: trimmed }, ...referenceParts]

    const userMessage: Message = {
      id: createId(),
      role: 'user',
      parts: userParts,
      createdAt: Date.now(),
    }

    setImageMessages((current) => [...current, userMessage])
    setImageInput('')
    setIsImageLoading(true)
    setImageError(null)
    setImageAttachmentError(null)
    setImageReferenceImages([])

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: IMAGE_MODEL_ID })
      const history: Content[] = []

      imageMessages.forEach((message) => {
        const parts: Part[] = []

        message.parts.forEach((part) => {
          if (part.type === 'text') {
            parts.push({ text: part.text })
          } else if (part.type === 'image' && part.data && message.role === 'user') {
            parts.push({
              inlineData: {
                data: part.data,
                mimeType: part.mimeType,
              },
            })
          }
        })

        if (parts.length > 0) {
          history.push({
            role: message.role,
            parts,
          })
        }
      })
      const response = await model.generateContent({
        contents: [
          ...history,
          {
            role: 'user',
            parts: [{ text: trimmed }, ...inlineReferenceParts],
          },
        ],
      })

      const parts =
        response.response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? []

      const imageParts: MessagePart[] = []
      const textParts: MessagePart[] = []

      parts.forEach((part) => {
        if ('inlineData' in part && part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType ?? 'image/png'
          if (mimeType.startsWith('image/')) {
            imageParts.push({
              id: createId(),
              type: 'image',
              mimeType,
              data: part.inlineData.data,
              alt: `Generated image for prompt: ${trimmed}`,
            })
          }
        }
        if ('fileData' in part && part.fileData?.fileUri) {
          imageParts.push({
            id: createId(),
            type: 'image',
            mimeType: part.fileData.mimeType ?? 'image/png',
            data: '',
            alt: `Image available at ${part.fileData.fileUri}`,
          })
        }
        if ('text' in part && part.text) {
          textParts.push({ id: createId(), type: 'text', text: part.text })
        }
      })

      if (imageParts.length === 0 && textParts.length === 0) {
        throw new Error('Gemini did not return any image content for this prompt.')
      }

      const modelMessage: Message = {
        id: createId(),
        role: 'model',
        parts: [...imageParts, ...textParts],
        createdAt: Date.now(),
      }

      setImageMessages((current) => [...current, modelMessage])
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to contact Gemini. Please try again.'
      setImageError(message)
    } finally {
      setIsImageLoading(false)
    }
  }

  const handleImageReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''

    if (files.length === 0) {
      return
    }

    const remainingSlots = MAX_IMAGE_REFERENCES - imageReferenceImages.length
    if (remainingSlots <= 0) {
      setImageAttachmentError(`You can attach up to ${MAX_IMAGE_REFERENCES} images per prompt.`)
      return
    }

    const validFiles = files.filter((file) => file.type.startsWith('image/'))
    if (validFiles.length === 0) {
      setImageAttachmentError('Reference files must be images (PNG, JPG, etc.).')
      return
    }

    const filesToProcess = validFiles.slice(0, remainingSlots)

    try {
      const newImages: ReferenceImageState[] = []
      for (const file of filesToProcess) {
        const { base64, dataUrl } = await readImageFile(file)
        newImages.push({
          base64,
          dataUrl,
          mimeType: file.type,
          name: file.name,
        })
      }

      setImageReferenceImages((current) => [...current, ...newImages])
      if (validFiles.length > remainingSlots) {
        setImageAttachmentError(`Only ${MAX_IMAGE_REFERENCES} images can be attached per prompt.`)
      } else {
        setImageAttachmentError(null)
      }
    } catch (fileError) {
      const message = fileError instanceof Error ? fileError.message : 'Unable to read image file.'
      setImageAttachmentError(message)
    }
  }

  const handleRemoveImageReference = (index: number) => {
    setImageReferenceImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
    setImageAttachmentError(null)
  }

  const handleGenerateVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmed = videoPrompt.trim()
    if (!trimmed || isVideoGenerating) {
      return
    }

    if (!apiKey) {
      setIsApiKeyModalOpen(true)
      return
    }

    const userParts: MessagePart[] = [{ id: createId(), type: 'text', text: trimmed }]

    if (videoReferenceImage) {
      userParts.push({
        id: createId(),
        type: 'image',
        mimeType: videoReferenceImage.mimeType,
        data: videoReferenceImage.base64,
        alt: `Reference image: ${videoReferenceImage.name}`,
      })
    }

    const userMessage: Message = {
      id: createId(),
      role: 'user',
      parts: userParts,
      createdAt: Date.now(),
    }

    setVideoMessages((current) => [...current, userMessage])
    setVideoPrompt('')
    setVideoError(null)
    setVideoStatus('Submitting video generation request…')
    setIsVideoGenerating(true)

    try {
      const ai = new GoogleGenAI({ apiKey })
      const config = {
        numberOfVideos: 1,
        resolution: videoResolution,
        aspectRatio: videoAspectRatio,
        durationSeconds: videoDuration,
      }

      const payload: {
        model: string
        prompt: string
        config: typeof config
        image?: { imageBytes: string; mimeType: string }
      } = {
        model: VIDEO_MODEL_ID,
        prompt: trimmed,
        config,
      }

      if (videoReferenceImage) {
        payload.image = {
          imageBytes: videoReferenceImage.base64,
          mimeType: videoReferenceImage.mimeType,
        }
      }

      let operation = await ai.models.generateVideos(payload)
      let polls = 0

      while (!operation.done) {
        if (polls >= MAX_VIDEO_POLLS) {
          throw new Error('Video generation is taking longer than expected. Please try again later.')
        }
        setVideoStatus(`Generating video… (check ${polls + 1})`)
        polls += 1
        await wait(VIDEO_POLL_INTERVAL)
        operation = await ai.operations.getVideosOperation({ operation })
      }

      const generatedVideos = operation.response?.generatedVideos
      if (!generatedVideos || generatedVideos.length === 0) {
        throw new Error('No videos were generated.')
      }

      const firstVideo = generatedVideos[0]?.video
      if (!firstVideo?.uri) {
        throw new Error('Generated video is missing a URI.')
      }

      const decodedUri = decodeURIComponent(firstVideo.uri)
      const fetchUrl = `${decodedUri}&key=${encodeURIComponent(apiKey)}`
      setVideoStatus('Fetching generated video…')
      const response = await fetch(fetchUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      const modelMessage: Message = {
        id: createId(),
        role: 'model',
        parts: [
          {
            id: createId(),
            type: 'video',
            mimeType: blob.type || 'video/mp4',
            objectUrl,
            uri: decodedUri,
            alt: `Generated video for prompt: ${trimmed}`,
            metadata: {
              resolution: videoResolution,
              aspectRatio: videoAspectRatio,
              durationSeconds: videoDuration,
            },
          },
        ],
        createdAt: Date.now(),
      }

      setVideoMessages((current) => [...current, modelMessage])
      setVideoStatus(null)
    } catch (generateError) {
      const message =
        generateError instanceof Error ? generateError.message : 'Failed to generate video. Please try again.'
      setVideoError(message)
      setVideoStatus(null)
    } finally {
      setIsVideoGenerating(false)
    }
  }

  const handleReset = () => {
    if (activeTab === 'image') {
      setImageMessages([])
      setImageError(null)
      setImageReferenceImages([])
      setImageAttachmentError(null)
      setImageInput('')
    } else {
      releaseVideoResources(videoMessages)
      setVideoMessages([])
      setVideoError(null)
      setVideoStatus(null)
      setVideoPrompt('')
      setVideoReferenceImage(null)
      setVideoAspectRatio('16:9')
      setVideoResolution('720p')
      setVideoDuration(6)
    }
  }

  const handleApiKeySave = (nextKey: string) => {
    setApiKey(nextKey)
    setImageMessages([])
    setVideoMessages((current) => {
      releaseVideoResources(current)
      return []
    })
    setImageError(null)
    setImageAttachmentError(null)
    setVideoError(null)
    setImageInput('')
    setImageReferenceImages([])
    setVideoPrompt('')
    setVideoStatus(null)
    setVideoReferenceImage(null)
    setIsApiKeyModalOpen(false)
  }

  const handleClearApiKey = () => {
    setApiKey('')
    setImageMessages([])
    setVideoMessages((current) => {
      releaseVideoResources(current)
      return []
    })
    setImageError(null)
    setImageAttachmentError(null)
    setVideoError(null)
    setImageInput('')
    setImageReferenceImages([])
    setVideoPrompt('')
    setVideoStatus(null)
    setVideoReferenceImage(null)
    setIsApiKeyModalOpen(true)
  }

  const handleVideoDurationChange = (event: ChangeEvent<HTMLInputElement>) => {
    const numeric = Number(event.target.value)
    if (Number.isNaN(numeric)) {
      setVideoDuration(6)
      return
    }
    const clamped = Math.min(MAX_VIDEO_DURATION, Math.max(MIN_VIDEO_DURATION, numeric))
    setVideoDuration(clamped)
  }

  const handleVideoReferenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (!file.type.startsWith('image/')) {
      setVideoError('Reference files must be images (PNG, JPG, etc.).')
      return
    }
    try {
      const { base64, dataUrl } = await readImageFile(file)
      setVideoReferenceImage({
        base64,
        dataUrl,
        mimeType: file.type,
        name: file.name,
      })
      setVideoError(null)
    } catch (fileError) {
      const message = fileError instanceof Error ? fileError.message : 'Unable to read image file.'
      setVideoError(message)
    }
  }

  const handleClearVideoReference = () => {
    setVideoReferenceImage(null)
  }

  const sidebarHint =
    activeTab === 'image'
      ? 'Generate image previews with Gemini. Provide a descriptive text prompt and see the inline preview.'
      : 'Generate short 720p videos with the Veo preview model. Describe the motion you want, keep clips between 5-8 seconds, and optionally add a reference image.'

  const messagesToDisplay = activeTab === 'image' ? imageMessages : videoMessages
  const activeError = activeTab === 'image' ? imageError : videoError
  const isActiveGenerating = activeTab === 'image' ? isImageLoading : isVideoGenerating

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__header">
          <span className="sidebar__badge">Gemini Studio</span>
          <button className="sidebar__button" onClick={handleReset} type="button">
            {activeTab === 'image' ? 'New image session' : 'Clear videos'}
          </button>
        </div>
        <div className="sidebar__hint">{sidebarHint}</div>
      </aside>
      <main className="chat">
        <header className="chat__header">
          <div className="chat__title-group">
            <div className="chat__indicator" aria-hidden />
            <div>
              <h1 className="chat__title">Gemini Playground</h1>
              <p className="chat__subtitle">Use your API key to explore Gemini image and video generation.</p>
            </div>
          </div>
          <div className="chat__actions">
            <nav className="chat__tabs" aria-label="Generation mode">
              <button
                type="button"
                className={`chat__tab ${activeTab === 'image' ? 'chat__tab--active' : ''}`}
                onClick={() => handleTabChange('image')}
              >
                Image preview
              </button>
              <button
                type="button"
                className={`chat__tab ${activeTab === 'video' ? 'chat__tab--active' : ''}`}
                onClick={() => handleTabChange('video')}
              >
                Video generation
              </button>
            </nav>
            <button className="chat__action" type="button" onClick={() => setIsApiKeyModalOpen(true)}>
              {apiKey ? 'Manage API key' : 'Set API key'}
            </button>
          </div>
        </header>

        <section className="chat__messages" aria-live="polite">
          {messagesToDisplay.length === 0 ? (
            <div className="chat__empty">
              {activeTab === 'image' ? (
                <>
                  <h2>Describe the image you want to see</h2>
                  <p>For example: “A cozy reading nook with warm lighting and plants in watercolor style.”</p>
                </>
              ) : (
                <>
                  <h2>Describe the motion you want Gemini to create</h2>
                  <p>For example: “A cinematic drone flyover of a futuristic coastal city at sunrise.”</p>
                </>
              )}
            </div>
          ) : (
            messagesToDisplay.map((message) => {
              const hasMedia = message.parts.some((part) => part.type === 'image' || part.type === 'video')
              return (
                <article key={message.id} className={`message message--${message.role}`}>
                  <div className="message__avatar" aria-hidden>
                    {message.role === 'user' ? 'You' : 'G'}
                  </div>
                  <div className={`message__bubble ${hasMedia ? 'message__bubble--media' : ''}`}>
                    <div className="message__parts">
                      {message.parts.map((part) => {
                        if (part.type === 'text') {
                          return (
                            <div key={part.id} className="message__markdown">
                              <ReactMarkdown>{part.text}</ReactMarkdown>
                            </div>
                          )
                        }
                        if (part.type === 'image') {
                          if (part.data) {
                            const dataUrl = `data:${part.mimeType};base64,${part.data}`
                            return (
                              <figure key={part.id} className="message__image">
                                <img src={dataUrl} alt={part.alt ?? 'Generated image'} />
                                {part.alt && <figcaption>{part.alt}</figcaption>}
                              </figure>
                            )
                          }
                          return (
                            <div key={part.id} className="message__fallback">
                              {part.alt ?? 'Image generated. Use Google AI Studio to retrieve it.'}
                            </div>
                          )
                        }
                        if (part.type === 'video') {
                          const openHref = apiKey
                            ? `${part.uri}&key=${encodeURIComponent(apiKey)}`
                            : part.uri
                          return (
                            <figure key={part.id} className="message__video">
                              <video controls playsInline src={part.objectUrl} />
                              <figcaption>
                                <div className="message__video-title">{part.alt ?? 'Generated video'}</div>
                                <div className="message__video-meta">
                                  <span>
                                    {part.metadata.resolution} • {part.metadata.aspectRatio}
                                    {part.metadata.durationSeconds
                                      ? ` • ${part.metadata.durationSeconds}s`
                                      : ''}
                                  </span>
                                  <div className="message__video-actions">
                                    <a href={part.objectUrl} download={`gemini-video-${part.id}.mp4`}>
                                      Download
                                    </a>
                                    <a href={openHref} target="_blank" rel="noreferrer">
                                      Open source URI
                                    </a>
                                  </div>
                                </div>
                              </figcaption>
                            </figure>
                          )
                        }
                        return null
                      })}
                    </div>
                  </div>
                </article>
              )
            })
          )}
          {isActiveGenerating && (
            <article className="message message--model">
              <div className="message__avatar" aria-hidden>
                G
              </div>
              <div className="message__bubble message__bubble--media">
                <div className="typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </article>
          )}
          <div ref={messagesEndRef} />
        </section>

        {activeTab === 'video' && videoStatus && <div className="chat__status">{videoStatus}</div>}
        {activeError && <div className="chat__error">{activeError}</div>}

        {activeTab === 'image' ? (
          <form className="composer" onSubmit={handleImageSubmit}>
            <label className="composer__label" htmlFor="image-input">
              Prompt Gemini (image)
            </label>
            <div className="composer__field composer__field--image">
              <div className="composer__input">
                <textarea
                  id="image-input"
                  placeholder={apiKey ? 'Describe the image you want Gemini to create…' : 'Add your API key to start generating images'}
                  value={imageInput}
                  onChange={(event) => setImageInput(event.target.value)}
                  disabled={isImageFormDisabled}
                  rows={TEXTAREA_LINES}
                />
                <div className="image-attachments">
                  <label className="image-attachments__picker">
                    <span>Reference images (optional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageReferenceChange}
                      disabled={
                        isImageFormDisabled || imageReferenceImages.length >= MAX_IMAGE_REFERENCES
                      }
                    />
                  </label>
                  {imageAttachmentError && <div className="image-attachments__error">{imageAttachmentError}</div>}
                  {imageReferenceImages.length > 0 && (
                    <div className="image-attachments__list">
                      {imageReferenceImages.map((image, index) => (
                        <div key={`${image.name}-${index}`} className="image-attachments__item">
                          <img src={image.dataUrl} alt={`Reference ${image.name}`} />
                          <div className="image-attachments__meta">
                            <span title={image.name}>{image.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveImageReference(index)}
                              disabled={isImageFormDisabled}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="image-attachments__hint">
                    Add up to {MAX_IMAGE_REFERENCES} reference images to guide Gemini&apos;s output.
                  </p>
                </div>
              </div>
              <button className="composer__submit" type="submit" disabled={isImageFormDisabled || !imageInput.trim()}>
                Generate image
              </button>
            </div>
          </form>
        ) : (
          <form className="composer composer--video" onSubmit={handleGenerateVideo}>
            <label className="composer__label" htmlFor="video-input">
              Prompt Gemini (video)
            </label>
            <div className="composer__field composer__field--stacked">
              <textarea
                id="video-input"
                placeholder={apiKey ? 'Describe the video you want Gemini to create…' : 'Add your API key to start generating videos'}
                value={videoPrompt}
                onChange={(event) => setVideoPrompt(event.target.value)}
                disabled={isVideoFormDisabled}
                rows={TEXTAREA_LINES}
              />
              <div className="video-options">
                <label className="video-option">
                  <span>Resolution</span>
                  <select
                    value={videoResolution}
                    onChange={(event) => setVideoResolution(event.target.value)}
                    disabled={isVideoFormDisabled}
                  >
                    <option value="720p">720p</option>
                  </select>
                </label>
                <label className="video-option">
                  <span>Aspect ratio</span>
                  <select
                    value={videoAspectRatio}
                    onChange={(event) => setVideoAspectRatio(event.target.value)}
                    disabled={isVideoFormDisabled}
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </label>
                <label className="video-option">
                  <span>Duration (sec)</span>
                  <input
                    type="number"
                    min={MIN_VIDEO_DURATION}
                    max={MAX_VIDEO_DURATION}
                    value={videoDuration}
                    onChange={handleVideoDurationChange}
                    disabled={isVideoFormDisabled}
                  />
                </label>
              </div>
              <div className="video-reference">
                <label className="video-reference__picker">
                  <span>Reference image (optional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleVideoReferenceChange}
                    disabled={isVideoFormDisabled}
                  />
                </label>
                {videoReferenceImage && (
                  <div className="video-reference__preview">
                    <img src={videoReferenceImage.dataUrl} alt={`Reference ${videoReferenceImage.name}`} />
                    <div className="video-reference__meta">
                      <span>{videoReferenceImage.name}</span>
                      <button type="button" onClick={handleClearVideoReference} disabled={isVideoFormDisabled}>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                <p className="video-reference__hint">Gemini supports 720p output and clips between 5-8 seconds.</p>
              </div>
              <div className="composer__actions">
                <button
                  className="composer__submit"
                  type="submit"
                  disabled={isVideoFormDisabled || !videoPrompt.trim()}
                >
                  Generate video
                </button>
              </div>
            </div>
          </form>
        )}
      </main>

      {isApiKeyModalOpen && (
        <ApiKeyModal
          defaultValue={apiKey}
          onSave={handleApiKeySave}
          onClose={() => setIsApiKeyModalOpen(false)}
          onClear={handleClearApiKey}
          forceEntry={!apiKey}
        />
      )}
    </div>
  )
}

type ApiKeyModalProps = {
  defaultValue: string
  onSave: (key: string) => void
  onClose: () => void
  onClear: () => void
  forceEntry?: boolean
}

function ApiKeyModal({ defaultValue, onSave, onClose, onClear, forceEntry = false }: ApiKeyModalProps) {
  const [value, setValue] = useState(defaultValue)
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('API key is required')
      return
    }
    setError(null)
    onSave(trimmed)
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
      <div
        className="modal__backdrop"
        onClick={() => {
          if (!forceEntry) {
            onClose()
          }
        }}
      />
      <div className="modal__content">
        {!forceEntry && (
          <button className="modal__close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        <form className="modal__form" onSubmit={handleSubmit}>
          <h2 className="modal__title" id="api-key-title">
            Enter your Gemini API key
          </h2>
          <p className="modal__description">
            Paste the API key from Google AI Studio. The key stays on this device and is never sent anywhere
            else.
          </p>
          <div className="modal__field">
            <label htmlFor="api-key-input">API key</label>
            <div className="modal__input-wrapper">
              <input
                id="api-key-input"
                type={reveal ? 'text' : 'password'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
                placeholder="AIza..."
              />
              <button
                className="modal__toggle"
                type="button"
                onClick={() => setReveal((current) => !current)}
                aria-label={reveal ? 'Hide API key' : 'Show API key'}
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
            {error && <div className="modal__error">{error}</div>}
          </div>
          <div className="modal__actions">
            {!forceEntry && (
              <button className="modal__secondary" type="button" onClick={onClear}>
                Remove key
              </button>
            )}
            <button className="modal__primary" type="submit">
              Save key
            </button>
          </div>
          <a
            className="modal__link"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Get an API key
          </a>
        </form>
      </div>
    </div>
  )
}

export default App
