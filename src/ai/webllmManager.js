import { CreateMLCEngine } from '@mlc-ai/web-llm'
import { useGameStore } from '../store/useGameStore'

const MODEL_CANDIDATES = [
	'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
	'gemma3-1b-it-q4f16_1-MLC',
	'Llama-3.2-1B-Instruct-q4f16_1-MLC',
]

let engine = null
let enginePromise = null
let preferredModelIndex = 0
let currentModelId = MODEL_CANDIDATES[preferredModelIndex]

const normalizeProgress = (progressValue) => {
	const numeric = Number(progressValue)
	if (!Number.isFinite(numeric)) {
		return 0
	}

	if (numeric > 1) {
		return Math.max(0, Math.min(1, numeric / 100))
	}

	return Math.max(0, Math.min(1, numeric))
}

const updateDownloadProgress = (report = {}) => {
	const setAiDownloadProgress = useGameStore.getState().setAiDownloadProgress
	setAiDownloadProgress({
		progress: Math.round(normalizeProgress(report.progress) * 100),
		text: typeof report.text === 'string' ? report.text : '',
	})
}

const toErrorMessage = (error) => {
	if (error instanceof Error) {
		return error.message || 'Model download failed'
	}

	return String(error || 'Model download failed')
}

export const isRecoverableAiError = (error) => {
	const message = toErrorMessage(error).toLowerCase()
	return (
		message.includes('device was lost')
		|| message.includes('devicelost')
		|| message.includes('dxgi_error_device_hung')
		|| message.includes('dxgi_error_device_removed')
		|| message.includes('gpu')
		|| message.includes('insufficient memory')
		|| message.includes('out of memory')
	)
}

const getCandidateByIndex = (index) => MODEL_CANDIDATES[(index + MODEL_CANDIDATES.length) % MODEL_CANDIDATES.length]

const getOrderedCandidates = () => {
	const ordered = []
	for (let offset = 0; offset < MODEL_CANDIDATES.length; offset += 1) {
		const index = (preferredModelIndex + offset) % MODEL_CANDIDATES.length
		ordered.push(getCandidateByIndex(index))
	}
	return ordered
}

const tryCreateEngine = async (modelId) => {
	useGameStore.getState().setAiDownloadStarted({ modelId })
	const createdEngine = await CreateMLCEngine(modelId, {
		initProgressCallback: updateDownloadProgress,
	})
	currentModelId = modelId
	return createdEngine
}

const clearEngine = () => {
	engine = null
	enginePromise = null
}

export const recoverAiModelFromRuntimeError = async (error) => {
	if (!isRecoverableAiError(error)) {
		throw error
	}

	clearEngine()
	preferredModelIndex = (preferredModelIndex + 1) % MODEL_CANDIDATES.length
	currentModelId = getCandidateByIndex(preferredModelIndex)
	return startAiModelDownload()
}

export const startAiModelDownload = async () => {
	if (engine) {
		useGameStore.getState().setAiDownloadReady()
		return engine
	}

	if (enginePromise) {
		return enginePromise
	}

	enginePromise = (async () => {
		let lastError = null

		for (const modelId of getOrderedCandidates()) {
			try {
				const createdEngine = await tryCreateEngine(modelId)
				engine = createdEngine
				useGameStore.getState().setAiDownloadReady()
				return createdEngine
			} catch (error) {
				lastError = error
			}
		}

		const message = `${toErrorMessage(lastError)}. Tried model list: ${MODEL_CANDIDATES.join(', ')}`
		useGameStore.getState().setAiDownloadError(message)
		throw lastError || new Error('Model download failed')
	})().finally(() => {
		enginePromise = null
	})

	return enginePromise
}

export const getAiModelEngine = () => engine
export const getAiModelId = () => currentModelId

export const AI_MODEL_ID = MODEL_CANDIDATES[0]
